import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalQuery } from "./_generated/server";
import { getActiveEvent } from "./events";
import { tierValidator } from "./lib/constants";

// Full dump of one event's scouting data, shaped for consumers outside the app
// (spreadsheets, strategy scripts). It is deliberately denormalised — every row
// that references a team carries the team number too, so a consumer never has
// to join on Convex ids.
//
// Served publicly over HTTP by the /api/scouting route in http.ts, so it takes
// no identity and applies no authz. Keep it that way or the route breaks: an
// httpAction has no signed-in user to pass through.
//
// Because it is public, scouts are pseudonymous here — no user names, emails or
// user ids in the payload. See anonScoutLabels.

const exportTeamValidator = v.object({
  id: v.id("teams"),
  tbaKey: v.optional(v.string()),
  number: v.number(),
  nickname: v.string(),
  city: v.optional(v.string()),
  stateProv: v.optional(v.string()),
  country: v.optional(v.string()),
});

const exportMatchValidator = v.object({
  id: v.id("matches"),
  tbaKey: v.optional(v.string()),
  matchNumber: v.number(),
  redTeams: v.array(v.number()),
  blueTeams: v.array(v.number()),
  scheduledTime: v.optional(v.number()),
  predictedTime: v.optional(v.number()),
  actualTime: v.optional(v.number()),
  redScore: v.optional(v.number()),
  blueScore: v.optional(v.number()),
  played: v.boolean(),
});

const exportPitReportValidator = v.object({
  id: v.id("pitReports"),
  submittedAt: v.number(),
  teamId: v.id("teams"),
  teamNumber: v.union(v.number(), v.null()),
  // Pseudonym, not an identity — see anonScoutLabels.
  scout: v.string(),
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
  notes: v.optional(v.string()),
  photoUrl: v.union(v.string(), v.null()),
});

const exportPicklistValidator = v.object({
  id: v.id("picklists"),
  // "primary" is the single admin-owned list (no owner); "personal" lists
  // belong to one scout each.
  kind: v.union(v.literal("primary"), v.literal("personal")),
  // Same pseudonym a scout gets in pitReports, so a list can be lined up with
  // its author's reports. Null on the primary list, which has no owner.
  owner: v.union(v.string(), v.null()),
  entries: v.array(
    v.object({
      teamId: v.id("teams"),
      teamNumber: v.union(v.number(), v.null()),
      tier: tierValidator,
      rank: v.number(),
    }),
  ),
});

export const scoutingDataValidator = v.union(
  v.object({
    event: v.object({
      id: v.id("events"),
      tbaKey: v.string(),
      name: v.string(),
      isActive: v.boolean(),
      matchesSyncedAt: v.optional(v.number()),
    }),
    teams: v.array(exportTeamValidator),
    matches: v.array(exportMatchValidator),
    pitReports: v.array(exportPitReportValidator),
    picklists: v.array(exportPicklistValidator),
  }),
  v.null(),
);

async function findEvent(ctx: QueryCtx, tbaKey: string | undefined) {
  if (tbaKey === undefined) return await getActiveEvent(ctx);
  return await ctx.db
    .query("events")
    .withIndex("by_tba_key", (q) => q.eq("tbaKey", tbaKey))
    .first();
}

// Real names and emails never leave the deployment through this endpoint —
// every scout becomes "Scout 1", "Scout 2", … instead. The pseudonym is still
// per-scout, which is the part consumers actually need: it tells you two
// reports on one team came from two different people, and lines a personal
// picklist up with its author's reports.
//
// Labels are assigned in the order userIds are supplied, and callers supply
// them in table order (pit reports oldest-first, then picklists). That keeps a
// given scout on the same number across calls, so a consumer polling the
// endpoint doesn't see numbering shuffle underneath it; a scout filing their
// first report is appended at the end rather than renumbering everyone.
//
// This is pseudonymity, not deniability: someone who already knows the event
// can still de-anonymise by pattern (whoever scouted these five teams). Notes
// are passed through verbatim too, so a scout who signs a note has named
// themselves. Neither is fixable here — only by dropping the fields.
//
// No db reads at all now, which also drops the per-scout db.get this used to do.
function anonScoutLabels(userIds: Iterable<Id<"users">>) {
  const labels = new Map<Id<"users">, string>();
  for (const userId of userIds) {
    if (!labels.has(userId)) labels.set(userId, `Scout ${labels.size + 1}`);
  }
  return labels;
}

export const scoutingData = internalQuery({
  // Defaults to the active event; pass an event's TBA key to pull a past one.
  args: { eventKey: v.optional(v.string()) },
  returns: scoutingDataValidator,
  handler: async (ctx, { eventKey }) => {
    const event = await findEvent(ctx, eventKey);
    if (!event) return null;

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event_number", (q) => q.eq("eventId", event._id))
      .collect();
    const teamNumbers = new Map(teams.map((team) => [team._id, team.number]));

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_event_match", (q) => q.eq("eventId", event._id))
      .collect();

    const reports = await ctx.db
      .query("pitReports")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();

    const picklists = await ctx.db
      .query("picklists")
      .withIndex("by_event_owner", (q) => q.eq("eventId", event._id))
      .collect();

    const scoutLabels = anonScoutLabels([
      ...reports.map((report) => report.scoutId),
      ...picklists.flatMap((list) => (list.ownerId ? [list.ownerId] : [])),
    ]);

    return {
      event: {
        id: event._id,
        tbaKey: event.tbaKey,
        name: event.name,
        isActive: event.isActive,
        matchesSyncedAt: event.matchesSyncedAt,
      },
      teams: teams.map(({ _id, _creationTime, eventId: _e, ...rest }) => ({ id: _id, ...rest })),
      matches: matches.map(({ _id, _creationTime, eventId: _e, ...rest }) => ({
        id: _id,
        ...rest,
        // Mirrors the app's rule: scores only exist once a match has run.
        played: rest.redScore !== undefined,
      })),
      pitReports: await Promise.all(
        // scoutId is destructured out, not spread: it is a stable per-user
        // identifier, so leaking it would undo the anonymisation.
        reports.map(async ({ _id, _creationTime, eventId: _e, scoutId, photoId, ...rest }) => ({
          id: _id,
          submittedAt: _creationTime,
          ...rest,
          teamNumber: teamNumbers.get(rest.teamId) ?? null,
          scout: scoutLabels.get(scoutId) ?? "Scout",
          photoUrl: photoId ? await ctx.storage.getUrl(photoId) : null,
        })),
      ),
      picklists: picklists.map((list) => ({
        id: list._id,
        kind: list.ownerId === undefined ? ("primary" as const) : ("personal" as const),
        owner: list.ownerId ? (scoutLabels.get(list.ownerId) ?? null) : null,
        entries: list.entries.map((entry) => ({
          ...entry,
          teamNumber: teamNumbers.get(entry.teamId) ?? null,
        })),
      })),
    };
  },
});
