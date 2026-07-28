import { v } from "convex/values";
import { getActiveEvent } from "./events";
import { requireAdmin } from "./model/authz";
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
});

export const list = query({
  args: {},
  returns: v.array(matchValidator),
  handler: async (ctx) => {
    const event = await getActiveEvent(ctx);
    if (!event) return [];
    return await ctx.db
      .query("matches")
      .withIndex("by_event_match", (q) => q.eq("eventId", event._id))
      .collect();
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
    if (!event) throw new Error("No active event");
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
