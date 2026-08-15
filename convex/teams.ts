import { ConvexError, v } from "convex/values";
import { getActiveEvent } from "./events";
import { tierValidator } from "./lib/constants";
import { requireAdmin, requireUser } from "./model/authz";
import { watchedTeamIds } from "./watchlist";
import { mutation, query } from "./_generated/server";

export const teamValidator = v.object({
  _id: v.id("teams"),
  _creationTime: v.number(),
  eventId: v.id("events"),
  tbaKey: v.optional(v.string()),
  number: v.number(),
  nickname: v.string(),
  city: v.optional(v.string()),
  stateProv: v.optional(v.string()),
  country: v.optional(v.string()),
});

export const list = query({
  args: {},
  returns: v.array(teamValidator),
  handler: async (ctx) => {
    await requireUser(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return [];
    return await ctx.db
      .query("teams")
      .withIndex("by_event_number", (q) => q.eq("eventId", event._id))
      .collect();
  },
});

export const listWithStatus = query({
  args: {},
  returns: v.array(
    teamValidator.extend({
      scoutedByMe: v.boolean(),
      watchedByMe: v.boolean(),
      scoutCount: v.number(),
      personalTier: v.union(tierValidator, v.null()),
      primaryTier: v.union(tierValidator, v.null()),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return [];

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event_number", (q) => q.eq("eventId", event._id))
      .collect();

    const pitReports = await ctx.db
      .query("pitReports")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    const scoutCountByTeam = new Map<string, number>();
    const myScoutedTeamIds = new Set<string>();
    for (const report of pitReports) {
      scoutCountByTeam.set(report.teamId, (scoutCountByTeam.get(report.teamId) ?? 0) + 1);
      if (report.scoutId === user._id) myScoutedTeamIds.add(report.teamId);
    }

    const personalList = await ctx.db
      .query("picklists")
      .withIndex("by_event_owner", (q) => q.eq("eventId", event._id).eq("ownerId", user._id))
      .first();
    const personalTierByTeam = new Map(
      (personalList?.entries ?? []).map((e) => [e.teamId, e.tier]),
    );

    const primaryList =
      user.role === "admin"
        ? await ctx.db
            .query("picklists")
            .withIndex("by_event_owner", (q) => q.eq("eventId", event._id).eq("ownerId", undefined))
            .first()
        : null;
    const primaryTierByTeam = new Map(
      (primaryList?.entries ?? []).map((e) => [e.teamId, e.tier]),
    );

    const watchedIds = await watchedTeamIds(ctx, user._id, event._id);

    return teams.map((team) => ({
      ...team,
      scoutedByMe: myScoutedTeamIds.has(team._id),
      watchedByMe: watchedIds.has(team._id),
      scoutCount: scoutCountByTeam.get(team._id) ?? 0,
      personalTier: personalTierByTeam.get(team._id) ?? null,
      primaryTier: primaryTierByTeam.get(team._id) ?? null,
    }));
  },
});

export const get = query({
  args: { teamId: v.id("teams") },
  returns: v.union(teamValidator, v.null()),
  handler: async (ctx, { teamId }) => {
    await requireUser(ctx);
    return await ctx.db.get(teamId);
  },
});

export const upsertManual = mutation({
  args: {
    teamId: v.optional(v.id("teams")),
    number: v.number(),
    nickname: v.string(),
    city: v.optional(v.string()),
    stateProv: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  returns: v.id("teams"),
  handler: async (ctx, { teamId, ...fields }) => {
    await requireAdmin(ctx);
    if (teamId) {
      await ctx.db.patch(teamId, fields);
      return teamId;
    }
    const event = await getActiveEvent(ctx);
    if (!event) throw new ConvexError("No active event");
    return await ctx.db.insert("teams", { eventId: event._id, ...fields });
  },
});

export const remove = mutation({
  args: { teamId: v.id("teams") },
  returns: v.null(),
  handler: async (ctx, { teamId }) => {
    await requireAdmin(ctx);

    const pitReports = await ctx.db
      .query("pitReports")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const report of pitReports) await ctx.db.delete(report._id);

    const watches = await ctx.db
      .query("watchlist")
      .withIndex("by_team_user", (q) => q.eq("teamId", teamId))
      .collect();
    for (const watch of watches) await ctx.db.delete(watch._id);

    const team = await ctx.db.get(teamId);
    if (team) {
      const picklists = await ctx.db
        .query("picklists")
        .withIndex("by_event_owner", (q) => q.eq("eventId", team.eventId))
        .collect();
      for (const list of picklists) {
        if (list.entries.some((e) => e.teamId === teamId)) {
          await ctx.db.patch(list._id, {
            entries: list.entries.filter((e) => e.teamId !== teamId),
          });
        }
      }
    }

    await ctx.db.delete(teamId);
    return null;
  },
});
