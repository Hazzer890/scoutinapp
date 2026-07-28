import { v } from "convex/values";
import { getActiveEvent } from "./events";
import { tierValidator } from "./lib/constants";
import { requireAdmin, requireUser } from "./model/authz";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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
      pitScouted: v.boolean(),
      matchReportCount: v.number(),
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
    const pitScoutedTeamIds = new Set(pitReports.map((r) => r.teamId));

    const matchReports = await ctx.db
      .query("matchReports")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    const matchReportCounts = new Map<Id<"teams">, number>();
    for (const r of matchReports) {
      matchReportCounts.set(r.teamId, (matchReportCounts.get(r.teamId) ?? 0) + 1);
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

    return teams.map((team) => ({
      ...team,
      pitScouted: pitScoutedTeamIds.has(team._id),
      matchReportCount: matchReportCounts.get(team._id) ?? 0,
      personalTier: personalTierByTeam.get(team._id) ?? null,
      primaryTier: primaryTierByTeam.get(team._id) ?? null,
    }));
  },
});

export const get = query({
  args: { teamId: v.id("teams") },
  returns: v.union(teamValidator, v.null()),
  handler: async (ctx, { teamId }) => await ctx.db.get(teamId),
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
    if (!event) throw new Error("No active event");
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

    const matchReports = await ctx.db
      .query("matchReports")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const report of matchReports) await ctx.db.delete(report._id);

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
