import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Includes the throughput benchmark team (see lib/constants.ts BENCHMARK_TEAM).
const TEAM_NUMBERS = [4788, 254, 1114, 2056, 1678, 3476, 118, 5460, 6800, 195, 2910, 33];

// Tables this seed owns. Deliberately excludes users/authTables — signed-in
// accounts (including whoever runs the e2e suite) must survive a reseed.
const WIPE_TABLES = [
  "teamComments",
  "pitReports",
  "picklists",
  "watchlist",
  "matches",
  "teams",
  "events",
] as const;

export const dev = internalMutation({
  args: {},
  returns: v.object({ eventId: v.id("events"), teams: v.number(), matches: v.number() }),
  handler: async (ctx) => {
    // Checked against every event, not just the active one — a real TBA-imported
    // event that's since been deactivated (e.g. admin switched events) must still
    // survive a reseed. Real TBA keys always start with the 4-digit season year.
    for (const event of await ctx.db.query("events").collect()) {
      if (/^\d{4}/.test(event.tbaKey)) {
        throw new Error(
          `Refusing to reseed: event "${event.tbaKey}" looks TBA-imported, not dev data.`,
        );
      }
    }

    for (const table of WIPE_TABLES) {
      for (const row of await ctx.db.query(table).collect()) {
        await ctx.db.delete(row._id);
      }
    }

    const eventId = await ctx.db.insert("events", {
      tbaKey: "devevent",
      name: "Dev Event",
      isActive: true,
    });

    const teamIds: Id<"teams">[] = [];
    for (const number of TEAM_NUMBERS) {
      teamIds.push(
        await ctx.db.insert("teams", {
          eventId,
          number,
          nickname: `Team ${number}`,
          city: "Testville",
          stateProv: "NH",
          country: "USA",
        }),
      );
    }

    // 6 quals, 3v3, each team's index offset by 4 so red/blue never collide within a match.
    // Q1 is already played (scored) so the Next Match view has something to skip past.
    const matchCount = 6;
    for (let i = 0; i < matchCount; i++) {
      const played = i === 0;
      await ctx.db.insert("matches", {
        eventId,
        matchNumber: i + 1,
        redTeams: [TEAM_NUMBERS[i % 12], TEAM_NUMBERS[(i + 4) % 12], TEAM_NUMBERS[(i + 8) % 12]],
        blueTeams: [TEAM_NUMBERS[(i + 1) % 12], TEAM_NUMBERS[(i + 5) % 12], TEAM_NUMBERS[(i + 9) % 12]],
        scheduledTime: Date.now() + (i - 1) * 10 * 60 * 1000,
        ...(played
          ? { actualTime: Date.now() - 8 * 60 * 1000, redScore: 74, blueScore: 61 }
          : {}),
      });
    }

    // Reports need a scoutId; skip them on a brand new db with no users yet
    // rather than failing the whole seed.
    const scout = await ctx.db.query("users").first();
    if (scout) {
      // Team 4788 (index 0) gets ballsPerMatch 20 so it works as the benchmark.
      const ballEstimates = [20, 10, 12, 8];
      for (let i = 0; i < 4; i++) {
        await ctx.db.insert("pitReports", {
          eventId,
          teamId: teamIds[i],
          scoutId: scout._id,
          canScoreBalls: true,
          canClimb: true,
          storageCapacity: 5,
          ballsPerMatch: ballEstimates[i],
          driverRating: 5,
          defenseRating: 4,
          tags: ["Fast"],
        });
      }

    }

    return { eventId, teams: teamIds.length, matches: matchCount };
  },
});
