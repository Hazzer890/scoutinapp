import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Includes the throughput benchmark team (see lib/constants.ts BENCHMARK_TEAM).
const TEAM_NUMBERS = [4788, 254, 1114, 2056, 1678, 3476, 118, 5460, 6800, 195, 2910, 33];

// Tables this seed owns. Deliberately excludes users/authTables — signed-in
// accounts (including whoever runs the e2e suite) must survive a reseed.
const WIPE_TABLES = ["pitReports", "matchReports", "picklists", "matches", "teams", "events"] as const;

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
    const matchCount = 6;
    for (let i = 0; i < matchCount; i++) {
      await ctx.db.insert("matches", {
        eventId,
        matchNumber: i + 1,
        redTeams: [TEAM_NUMBERS[i % 12], TEAM_NUMBERS[(i + 4) % 12], TEAM_NUMBERS[(i + 8) % 12]],
        blueTeams: [TEAM_NUMBERS[(i + 1) % 12], TEAM_NUMBERS[(i + 5) % 12], TEAM_NUMBERS[(i + 9) % 12]],
        scheduledTime: Date.now() + i * 10 * 60 * 1000,
      });
    }

    // Reports need a scoutId; skip them on a brand new db with no users yet
    // rather than failing the whole seed.
    const scout = await ctx.db.query("users").first();
    if (scout) {
      for (const teamId of teamIds.slice(0, 4)) {
        await ctx.db.insert("pitReports", {
          eventId,
          teamId,
          scoutId: scout._id,
          canScoreBalls: true,
          canClimb: true,
          storageCapacity: 5,
          driverRating: 7,
          defenseRating: 5,
          tags: ["Fast"],
        });
      }

      // Team 4788 (index 0) gets three reports so it works as the throughput benchmark.
      const benchmarkReports = [
        { ballsScored: 20, ballsMissed: 4, maxStorage: 5, climbAttempted: true, climbSucceeded: true },
        { ballsScored: 18, ballsMissed: 3, maxStorage: 4, climbAttempted: true, climbSucceeded: true },
        { ballsScored: 22, ballsMissed: 5, maxStorage: 5, climbAttempted: false, climbSucceeded: false },
      ];
      for (let i = 0; i < benchmarkReports.length; i++) {
        await ctx.db.insert("matchReports", {
          eventId,
          teamId: teamIds[0],
          matchNumber: i + 1,
          scoutId: scout._id,
          ...benchmarkReports[i],
          playedDefense: false,
          tags: [],
        });
      }
      await ctx.db.insert("matchReports", {
        eventId,
        teamId: teamIds[1],
        matchNumber: 1,
        scoutId: scout._id,
        ballsScored: 10,
        ballsMissed: 2,
        maxStorage: 3,
        climbAttempted: false,
        climbSucceeded: false,
        playedDefense: true,
        tags: ["Plays defense"],
      });
    }

    return { eventId, teams: teamIds.length, matches: matchCount };
  },
});
