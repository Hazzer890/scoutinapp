import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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
  driverRating: v.number(),
  defenseRating: v.number(),
  tags: v.array(v.string()),
  photoId: v.optional(v.id("_storage")),
  notes: v.optional(v.string()),
});

export const getForTeam = query({
  args: { teamId: v.id("teams") },
  returns: v.union(pitReportValidator.extend({ photoUrl: v.union(v.string(), v.null()) }), v.null()),
  handler: async (ctx, { teamId }) => {
    await requireUser(ctx);
    const report = await ctx.db
      .query("pitReports")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();
    if (!report) return null;
    const photoUrl = report.photoId ? await ctx.storage.getUrl(report.photoId) : null;
    return { ...report, photoUrl };
  },
});

export const submit = mutation({
  args: {
    teamId: v.id("teams"),
    canScoreBalls: v.boolean(),
    canClimb: v.boolean(),
    storageCapacity: v.optional(v.number()),
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
    if (!team) throw new Error("Team not found");

    const existing = await ctx.db
      .query("pitReports")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();
    const doc = { eventId: team.eventId, teamId, scoutId: user._id, ...fields };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
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
