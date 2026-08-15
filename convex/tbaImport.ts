import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireAdmin, requireUser } from "./model/authz";
import { getActiveEvent, upsertActiveEvent } from "./events";
import { isUpcoming } from "./lib/tbaMapping";

// Actions have no db access, so tba.importEvent checks the caller's role
// through this internal query instead of calling requireAdmin directly.
export const checkAdmin = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    try {
      await requireAdmin(ctx);
      return true;
    } catch {
      return false;
    }
  },
});

const teamRowValidator = v.object({
  tbaKey: v.string(),
  number: v.number(),
  nickname: v.string(),
  city: v.optional(v.string()),
  stateProv: v.optional(v.string()),
  country: v.optional(v.string()),
});

const matchRowValidator = v.object({
  tbaKey: v.string(),
  matchNumber: v.number(),
  redTeams: v.array(v.number()),
  blueTeams: v.array(v.number()),
  scheduledTime: v.optional(v.number()),
  predictedTime: v.optional(v.number()),
  actualTime: v.optional(v.number()),
  redScore: v.optional(v.number()),
  blueScore: v.optional(v.number()),
});

type MatchRow = typeof matchRowValidator.type;

// Upserts by tbaKey (matches have no tbaKey index and event schedules are
// small). Every optional field is spelled out on the patch — an omitted key
// would leave a stale value behind when TBA drops, say, a predicted time.
async function upsertMatches(ctx: MutationCtx, eventId: Id<"events">, rows: MatchRow[]) {
  const existing = await ctx.db
    .query("matches")
    .withIndex("by_event_match", (q) => q.eq("eventId", eventId))
    .collect();

  for (const row of rows) {
    const match = existing.find((m) => m.tbaKey === row.tbaKey);
    const fields = {
      tbaKey: row.tbaKey,
      matchNumber: row.matchNumber,
      redTeams: row.redTeams,
      blueTeams: row.blueTeams,
      scheduledTime: row.scheduledTime,
      predictedTime: row.predictedTime,
      actualTime: row.actualTime,
      redScore: row.redScore,
      blueScore: row.blueScore,
    };
    if (match) {
      await ctx.db.patch(match._id, fields);
    } else {
      await ctx.db.insert("matches", { eventId, ...fields });
    }
  }

  await ctx.db.patch(eventId, { matchesSyncedAt: Date.now() });
}

export const applyImport = internalMutation({
  args: {
    eventKey: v.string(),
    eventName: v.string(),
    teams: v.array(teamRowValidator),
    matches: v.array(matchRowValidator),
  },
  returns: v.object({ teams: v.number(), matches: v.number() }),
  handler: async (ctx, { eventKey, eventName, teams, matches }) => {
    const eventId = await upsertActiveEvent(ctx, { tbaKey: eventKey, name: eventName });

    // Matched by tbaKey, not table index (teams/matches have no tbaKey index and
    // event rosters are small). A manual team (no tbaKey) with a matching
    // `number` is adopted (gains a tbaKey) instead of leaving a duplicate;
    // manual teams whose number isn't in this import are left untouched.
    const existingTeams = await ctx.db
      .query("teams")
      .withIndex("by_event_number", (q) => q.eq("eventId", eventId))
      .collect();
    for (const row of teams) {
      const existing =
        existingTeams.find((t) => t.tbaKey === row.tbaKey) ??
        existingTeams.find((t) => t.tbaKey === undefined && t.number === row.number);
      if (existing) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert("teams", { eventId, ...row });
      }
    }

    await upsertMatches(ctx, eventId, matches);

    return { teams: teams.length, matches: matches.length };
  },
});

// Schedule-only sync for the already-active event. Any signed-in scout can run
// it (unlike the admin-only full import): it can't create or switch events, it
// only refreshes times and results for the event everyone is already scouting.
export const syncMatches = internalMutation({
  args: { matches: v.array(matchRowValidator) },
  returns: v.union(
    v.object({ ok: v.literal(true), upcoming: v.number(), total: v.number() }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, { matches }) => {
    await requireUser(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return { ok: false as const, error: "No active event" };

    await upsertMatches(ctx, event._id, matches);
    return {
      ok: true as const,
      upcoming: matches.filter(isUpcoming).length,
      total: matches.length,
    };
  },
});

// Lets tba.refreshMatches (an action, so no db access) resolve which event to
// pull and confirm the caller is signed in before it hits TBA.
export const activeEventKey = internalQuery({
  args: {},
  returns: v.object({ signedIn: v.boolean(), tbaKey: v.union(v.string(), v.null()) }),
  handler: async (ctx) => {
    try {
      await requireUser(ctx);
    } catch {
      return { signedIn: false, tbaKey: null };
    }
    const event = await getActiveEvent(ctx);
    return { signedIn: true, tbaKey: event?.tbaKey ?? null };
  },
});
