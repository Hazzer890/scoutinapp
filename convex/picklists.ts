import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getActiveEvent } from "./events";
import { S_TIER_MAX, TIERS, tierValidator, type Tier } from "./lib/constants";
import { mergeLists, type Entry } from "./lib/consensus";
import { requireAdmin, requireUser } from "./model/authz";

const entryValidator = v.object({
  teamId: v.id("teams"),
  tier: tierValidator,
  rank: v.number(),
});

async function findList(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  ownerId: Id<"users"> | undefined,
) {
  return await ctx.db
    .query("picklists")
    .withIndex("by_event_owner", (q) => q.eq("eventId", eventId).eq("ownerId", ownerId))
    .first();
}

// Personal lists (ownerId set) for the active event, plus every team in it.
// The primary list is never an input to the merge.
async function mergeInputsForActiveEvent(ctx: QueryCtx | MutationCtx) {
  const event = await getActiveEvent(ctx);
  if (!event) return null;
  const lists = await ctx.db
    .query("picklists")
    .withIndex("by_event_owner", (q) => q.eq("eventId", event._id))
    .collect();
  const teams = await ctx.db
    .query("teams")
    .withIndex("by_event", (q) => q.eq("eventId", event._id))
    .collect();
  return {
    event,
    entryLists: lists.filter((l) => l.ownerId !== undefined).map((l) => l.entries),
    allTeamIds: teams.map((t) => t._id),
  };
}

function groupByTier(entries: Entry[]): Map<Tier, Entry[]> {
  const groups = new Map<Tier, Entry[]>(TIERS.map((tier) => [tier, []]));
  for (const entry of entries) groups.get(entry.tier)!.push(entry);
  for (const group of groups.values()) group.sort((a, b) => a.rank - b.rank);
  return groups;
}

export const getMine = query({
  args: {},
  returns: v.object({ entries: v.array(entryValidator) }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return { entries: [] };
    const list = await findList(ctx, event._id, user._id);
    return { entries: list?.entries ?? [] };
  },
});

export const getPrimary = query({
  args: {},
  returns: v.object({ entries: v.array(entryValidator) }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return { entries: [] };
    const list = await findList(ctx, event._id, undefined);
    return { entries: list?.entries ?? [] };
  },
});

export const listAll = query({
  args: {},
  returns: v.array(
    v.object({
      scoutId: v.id("users"),
      scoutName: v.union(v.string(), v.null()),
      entries: v.array(entryValidator),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return [];
    const lists = await ctx.db
      .query("picklists")
      .withIndex("by_event_owner", (q) => q.eq("eventId", event._id))
      .collect();

    const result = [];
    for (const list of lists) {
      if (list.ownerId === undefined) continue;
      const user = await ctx.db.get(list.ownerId);
      result.push({
        scoutId: list.ownerId,
        scoutName: user?.name ?? user?.email ?? null,
        entries: list.entries,
      });
    }
    return result;
  },
});

export const moveEntry = mutation({
  args: {
    scope: v.union(v.literal("mine"), v.literal("primary")),
    teamId: v.id("teams"),
    tier: v.union(tierValidator, v.null()),
    rank: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { scope, teamId, tier, rank }) => {
    let ownerId: Id<"users"> | undefined;
    if (scope === "primary") {
      await requireAdmin(ctx);
      ownerId = undefined;
    } else {
      ownerId = (await requireUser(ctx))._id;
    }

    const event = await getActiveEvent(ctx);
    if (!event) throw new Error("No active event");

    const list = await findList(ctx, event._id, ownerId);
    const existing = list?.entries ?? [];
    const oldTier = existing.find((e) => e.teamId === teamId)?.tier;
    const groups = groupByTier(existing.filter((e) => e.teamId !== teamId));

    const touched = new Set<Tier>();
    if (oldTier) touched.add(oldTier);

    if (tier !== null) {
      const target = groups.get(tier)!;
      if (tier === "S" && target.length >= S_TIER_MAX) {
        throw new Error("S tier is full");
      }
      const clampedRank = Math.max(0, Math.min(rank, target.length));
      target.splice(clampedRank, 0, { teamId, tier, rank: clampedRank });
      touched.add(tier);
    }

    for (const t of touched) {
      groups.get(t)!.forEach((e, i) => {
        e.rank = i;
      });
    }

    const entries = TIERS.flatMap((t) => groups.get(t)!);
    if (list) {
      await ctx.db.patch(list._id, { entries });
    } else {
      await ctx.db.insert("picklists", { eventId: event._id, ownerId, entries });
    }
    return null;
  },
});

export const mergePreview = query({
  args: {},
  returns: v.array(
    v.object({
      teamId: v.id("teams"),
      score: v.number(),
      tier: tierValidator,
      lists: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const inputs = await mergeInputsForActiveEvent(ctx);
    if (!inputs) return [];
    return mergeLists(inputs.entryLists, inputs.allTeamIds);
  },
});

export const applyMerge = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const inputs = await mergeInputsForActiveEvent(ctx);
    if (!inputs) throw new Error("No active event");

    const merged = mergeLists(inputs.entryLists, inputs.allTeamIds);
    const rankByTier = new Map<Tier, number>();
    const entries: Entry[] = merged.map((r) => {
      const rank = rankByTier.get(r.tier) ?? 0;
      rankByTier.set(r.tier, rank + 1);
      return { teamId: r.teamId, tier: r.tier, rank };
    });

    const primary = await findList(ctx, inputs.event._id, undefined);
    if (primary) {
      await ctx.db.patch(primary._id, { entries });
    } else {
      await ctx.db.insert("picklists", { eventId: inputs.event._id, ownerId: undefined, entries });
    }
    return null;
  },
});
