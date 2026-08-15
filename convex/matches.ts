import { ConvexError, v } from "convex/values";
import { getActiveEvent } from "./events";
import { tierValidator } from "./lib/constants";
import { compareByPlayOrder, isUpcoming, matchTime } from "./lib/tbaMapping";
import { requireAdmin, requireUser } from "./model/authz";
import { statsForEvent } from "./stats";
import { watchedTeamIds } from "./watchlist";
import { mutation, query } from "./_generated/server";

export const matchValidator = v.object({
  _id: v.id("matches"),
  _creationTime: v.number(),
  eventId: v.id("events"),
  tbaKey: v.optional(v.string()),
  matchNumber: v.number(),
  redTeams: v.array(v.number()),
  blueTeams: v.array(v.number()),
  scheduledTime: v.optional(v.number()),
  predictedTime: v.optional(v.number()),
  actualTime: v.optional(v.number()),
  redScore: v.optional(v.number()),
  blueScore: v.optional(v.number()),
});

const allianceTeamValidator = v.object({
  number: v.number(),
  // Null when the schedule names a team that isn't in the event roster (a
  // surrogate, or a roster that hasn't been re-imported since the schedule).
  teamId: v.union(v.id("teams"), v.null()),
  nickname: v.union(v.string(), v.null()),
  watched: v.boolean(),
  scoutCount: v.number(),
  ballsPerMatch: v.union(v.number(), v.null()),
  tier: v.union(tierValidator, v.null()),
});

const upcomingMatchValidator = v.object({
  _id: v.id("matches"),
  matchNumber: v.number(),
  // Best available estimate: actual > TBA prediction > published schedule.
  time: v.union(v.number(), v.null()),
  timeIsPredicted: v.boolean(),
  red: v.array(allianceTeamValidator),
  blue: v.array(allianceTeamValidator),
  watchedCount: v.number(),
});

export const list = query({
  args: {},
  returns: v.array(matchValidator),
  handler: async (ctx) => {
    await requireUser(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return [];
    return await ctx.db
      .query("matches")
      .withIndex("by_event_match", (q) => q.eq("eventId", event._id))
      .collect();
  },
});

// Matches that haven't been played yet, in the order they'll run, each alliance
// resolved to roster teams with the scouting context the stands need at a glance.
export const upcoming = query({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    matches: v.array(upcomingMatchValidator),
    // Total upcoming matches, ignoring `limit`, so the page can say "+12 more".
    totalUpcoming: v.number(),
    syncedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, { limit }) => {
    const user = await requireUser(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return { matches: [], totalUpcoming: 0, syncedAt: null };

    const all = await ctx.db
      .query("matches")
      .withIndex("by_event_match", (q) => q.eq("eventId", event._id))
      .collect();
    const pending = all.filter(isUpcoming).sort(compareByPlayOrder);

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event_number", (q) => q.eq("eventId", event._id))
      .collect();
    const teamByNumber = new Map(teams.map((t) => [t.number, t]));

    const watchedIds = await watchedTeamIds(ctx, user._id, event._id);
    const stats = await statsForEvent(ctx, event._id);

    const pitReports = await ctx.db
      .query("pitReports")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    const scoutCountByTeam = new Map<string, number>();
    for (const report of pitReports) {
      scoutCountByTeam.set(report.teamId, (scoutCountByTeam.get(report.teamId) ?? 0) + 1);
    }

    const personalList = await ctx.db
      .query("picklists")
      .withIndex("by_event_owner", (q) => q.eq("eventId", event._id).eq("ownerId", user._id))
      .first();
    const tierByTeam = new Map((personalList?.entries ?? []).map((e) => [e.teamId, e.tier]));

    const resolve = (number: number) => {
      const team = teamByNumber.get(number);
      if (!team) {
        return {
          number,
          teamId: null,
          nickname: null,
          watched: false,
          scoutCount: 0,
          ballsPerMatch: null,
          tier: null,
        };
      }
      return {
        number,
        teamId: team._id,
        nickname: team.nickname,
        watched: watchedIds.has(team._id),
        scoutCount: scoutCountByTeam.get(team._id) ?? 0,
        ballsPerMatch: stats[team._id]?.ballsPerMatch ?? null,
        tier: tierByTeam.get(team._id) ?? null,
      };
    };

    const selected = limit === undefined ? pending : pending.slice(0, Math.max(0, limit));

    return {
      matches: selected.map((match) => {
        const red = match.redTeams.map(resolve);
        const blue = match.blueTeams.map(resolve);
        return {
          _id: match._id,
          matchNumber: match.matchNumber,
          time: matchTime(match) ?? null,
          timeIsPredicted: match.actualTime === undefined && match.predictedTime !== undefined,
          red,
          blue,
          watchedCount: [...red, ...blue].filter((t) => t.watched).length,
        };
      }),
      totalUpcoming: pending.length,
      syncedAt: event.matchesSyncedAt ?? null,
    };
  },
});

export const upsertManual = mutation({
  args: {
    matchId: v.optional(v.id("matches")),
    matchNumber: v.number(),
    redTeams: v.array(v.number()),
    blueTeams: v.array(v.number()),
    scheduledTime: v.optional(v.number()),
  },
  returns: v.id("matches"),
  handler: async (ctx, { matchId, ...fields }) => {
    await requireAdmin(ctx);
    if (matchId) {
      await ctx.db.patch(matchId, fields);
      return matchId;
    }
    const event = await getActiveEvent(ctx);
    if (!event) throw new ConvexError("No active event");
    return await ctx.db.insert("matches", { eventId: event._id, ...fields });
  },
});

export const remove = mutation({
  args: { matchId: v.id("matches") },
  returns: v.null(),
  handler: async (ctx, { matchId }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(matchId);
    return null;
  },
});
