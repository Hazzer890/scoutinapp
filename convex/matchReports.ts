import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./model/authz";

export const matchReportValidator = v.object({
  _id: v.id("matchReports"),
  _creationTime: v.number(),
  eventId: v.id("events"),
  teamId: v.id("teams"),
  matchId: v.optional(v.id("matches")),
  matchNumber: v.number(),
  scoutId: v.id("users"),
  ballsScored: v.number(),
  ballsMissed: v.number(),
  maxStorage: v.number(),
  climbAttempted: v.boolean(),
  climbSucceeded: v.boolean(),
  playedDefense: v.boolean(),
  tags: v.array(v.string()),
  notes: v.optional(v.string()),
});

export const submit = mutation({
  args: {
    teamId: v.id("teams"),
    matchNumber: v.number(),
    matchId: v.optional(v.id("matches")),
    ballsScored: v.number(),
    ballsMissed: v.number(),
    maxStorage: v.number(),
    climbAttempted: v.boolean(),
    climbSucceeded: v.boolean(),
    playedDefense: v.boolean(),
    tags: v.array(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { teamId, ...fields }) => {
    const user = await requireUser(ctx);
    const team = await ctx.db.get(teamId);
    if (!team) throw new ConvexError("Team not found");

    await ctx.db.insert("matchReports", {
      eventId: team.eventId,
      teamId,
      scoutId: user._id,
      ...fields,
    });
    return null;
  },
});

export const listForTeam = query({
  args: { teamId: v.id("teams") },
  returns: v.array(matchReportValidator.extend({ scoutName: v.union(v.string(), v.null()) })),
  handler: async (ctx, { teamId }) => {
    await requireUser(ctx);
    const reports = await ctx.db
      .query("matchReports")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    return await Promise.all(
      reports.map(async (report) => {
        const scout = await ctx.db.get(report.scoutId);
        return { ...report, scoutName: scout?.name ?? null };
      }),
    );
  },
});
