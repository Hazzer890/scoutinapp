import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireAdmin } from "./model/authz";
import { upsertActiveEvent } from "./events";

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
});

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
    // event rosters are small). Rows with no tbaKey (manual teams) never match,
    // so manual entries are left untouched.
    const existingTeams = await ctx.db
      .query("teams")
      .withIndex("by_event_number", (q) => q.eq("eventId", eventId))
      .collect();
    for (const row of teams) {
      const existing = existingTeams.find((t) => t.tbaKey === row.tbaKey);
      if (existing) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert("teams", { eventId, ...row });
      }
    }

    const existingMatches = await ctx.db
      .query("matches")
      .withIndex("by_event_match", (q) => q.eq("eventId", eventId))
      .collect();
    for (const row of matches) {
      const existing = existingMatches.find((m) => m.tbaKey === row.tbaKey);
      if (existing) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert("matches", { eventId, ...row });
      }
    }

    return { teams: teams.length, matches: matches.length };
  },
});
