import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { aggregatePitReports } from "./lib/pitAggregate";
import { requireUser } from "./model/authz";

export const pitReportValidator = v.object({
  _id: v.id("pitReports"),
  _creationTime: v.number(),
  eventId: v.id("events"),
  teamId: v.id("teams"),
  scoutId: v.id("users"),
  canScoreBalls: v.boolean(),
  canClimb: v.boolean(),
  storageCapacity: v.optional(v.number()),
  ballsPerMatch: v.optional(v.number()),
  hasAuto: v.optional(v.boolean()),
  autoSide: v.optional(v.union(v.literal("left"), v.literal("middle"), v.literal("right"))),
  autoDepth: v.optional(v.union(v.literal("close"), v.literal("middle"))),
  autoBalls: v.optional(v.number()),
  autoClimb: v.optional(v.boolean()),
  driverRating: v.number(),
  defenseRating: v.number(),
  tags: v.array(v.string()),
  photoId: v.optional(v.id("_storage")),
  notes: v.optional(v.string()),
});

export const getMine = query({
  args: { teamId: v.id("teams") },
  returns: v.union(pitReportValidator.extend({ photoUrl: v.union(v.string(), v.null()) }), v.null()),
  handler: async (ctx, { teamId }) => {
    const user = await requireUser(ctx);
    const report = await ctx.db
      .query("pitReports")
      .withIndex("by_team_scout", (q) => q.eq("teamId", teamId).eq("scoutId", user._id))
      .unique();
    if (!report) return null;
    const photoUrl = report.photoId ? await ctx.storage.getUrl(report.photoId) : null;
    return { ...report, photoUrl };
  },
});

const boolCountValidator = v.object({ yes: v.number(), total: v.number() });
const meanValidator = v.union(v.number(), v.null());

export const aggregateForTeam = query({
  args: { teamId: v.id("teams") },
  returns: v.union(
    v.object({
      scoutCount: v.number(),
      canScoreBalls: boolCountValidator,
      canClimb: boolCountValidator,
      hasAuto: boolCountValidator,
      autoClimb: boolCountValidator,
      storageCapacity: meanValidator,
      ballsPerMatch: meanValidator,
      autoBalls: meanValidator,
      driverRating: meanValidator,
      defenseRating: meanValidator,
      autoSide: v.union(
        v.object({
          value: v.union(v.literal("left"), v.literal("middle"), v.literal("right")),
          count: v.number(),
        }),
        v.null(),
      ),
      autoDepth: v.union(
        v.object({
          value: v.union(v.literal("close"), v.literal("middle")),
          count: v.number(),
        }),
        v.null(),
      ),
      tags: v.array(v.object({ tag: v.string(), count: v.number() })),
      notes: v.array(v.object({ scoutName: v.string(), note: v.string() })),
      photoUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { teamId }) => {
    await requireUser(ctx);
    const reports = await ctx.db
      .query("pitReports")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const agg = aggregatePitReports(reports);
    if (!agg) return null;
    const { photoId, notes, ...rest } = agg;
    return {
      ...rest,
      notes: await Promise.all(
        notes.map(async ({ scoutId, note }) => {
          const scout = await ctx.db.get(scoutId);
          return { scoutName: scout?.name ?? "Scout", note };
        }),
      ),
      photoUrl: photoId ? await ctx.storage.getUrl(photoId) : null,
    };
  },
});

export const submit = mutation({
  args: {
    teamId: v.id("teams"),
    canScoreBalls: v.boolean(),
    canClimb: v.boolean(),
    storageCapacity: v.optional(v.number()),
    ballsPerMatch: v.optional(v.number()),
    hasAuto: v.optional(v.boolean()),
    autoSide: v.optional(v.union(v.literal("left"), v.literal("middle"), v.literal("right"))),
    autoDepth: v.optional(v.union(v.literal("close"), v.literal("middle"))),
    autoBalls: v.optional(v.number()),
    autoClimb: v.optional(v.boolean()),
    driverRating: v.number(),
    defenseRating: v.number(),
    tags: v.array(v.string()),
    photoId: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { teamId, ...fields }) => {
    const user = await requireUser(ctx);
    const team = await ctx.db.get(teamId);
    if (!team) throw new ConvexError("Team not found");

    const existing = await ctx.db
      .query("pitReports")
      .withIndex("by_team_scout", (q) => q.eq("teamId", teamId).eq("scoutId", user._id))
      .unique();
    const doc = { eventId: team.eventId, teamId, scoutId: user._id, ...fields };
    if (existing) {
      await ctx.db.replace(existing._id, doc);
    } else {
      await ctx.db.insert("pitReports", doc);
    }
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
