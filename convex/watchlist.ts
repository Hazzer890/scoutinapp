import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getActiveEvent } from "./events";
import { requireUser } from "./model/authz";

// Team ids the given scout is watching at the event. Callers hold this while
// mapping over teams/matches, so it's a Set rather than a per-team lookup.
export async function watchedTeamIds(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  eventId: Id<"events">,
): Promise<Set<Id<"teams">>> {
  const rows = await ctx.db
    .query("watchlist")
    .withIndex("by_user_event", (q) => q.eq("userId", userId).eq("eventId", eventId))
    .collect();
  return new Set(rows.map((r) => r.teamId));
}

export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      teamId: v.id("teams"),
      number: v.number(),
      nickname: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return [];

    const rows = await ctx.db
      .query("watchlist")
      .withIndex("by_user_event", (q) => q.eq("userId", user._id).eq("eventId", event._id))
      .collect();

    const teams = [];
    for (const row of rows) {
      const team = await ctx.db.get(row.teamId);
      // A team deleted out from under the watchlist leaves a dangling row;
      // watchlist.toggle and teams.remove clean up, this just skips the gap.
      if (team) teams.push({ teamId: team._id, number: team.number, nickname: team.nickname });
    }
    return teams.sort((a, b) => a.number - b.number);
  },
});

export const toggle = mutation({
  args: { teamId: v.id("teams") },
  returns: v.boolean(),
  handler: async (ctx, { teamId }) => {
    const user = await requireUser(ctx);
    const team = await ctx.db.get(teamId);
    if (!team) throw new ConvexError("Team not found");

    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_team_user", (q) => q.eq("teamId", teamId).eq("userId", user._id))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return false;
    }
    await ctx.db.insert("watchlist", { eventId: team.eventId, teamId, userId: user._id });
    return true;
  },
});
