import { describe, expect, test } from "vitest";
import { setupTest } from "./setup.helpers";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { bootstrapRole } from "../auth";
import { BENCHMARK_TEAM } from "../lib/constants";

type Test = ReturnType<typeof setupTest>;

async function createUser(t: Test, role: "admin" | "scout") {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    await bootstrapRole(ctx, { userId, existingUserId: null });
    await ctx.db.patch(userId, { role });
    return userId;
  });
}

async function createEvent(t: Test, tbaKey = "2026test") {
  return await t.run((ctx) =>
    ctx.db.insert("events", { tbaKey, name: "Test Event", isActive: true }),
  );
}

async function createTeam(t: Test, eventId: Id<"events">, number: number) {
  return await t.run((ctx) =>
    ctx.db.insert("teams", { eventId, number, nickname: `Team ${number}` }),
  );
}

describe("pitReports.submit", () => {
  test("upserts by teamId: a second submit replaces the first, by any scout", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const firstScout = await createUser(t, "scout");
    const secondScout = await createUser(t, "scout");

    await t.withIdentity({ subject: firstScout }).mutation(api.pitReports.submit, {
      teamId,
      canScoreBalls: true,
      canClimb: false,
      storageCapacity: 3,
      driverRating: 2,
      defenseRating: 1,
      tags: ["Tippy"],
      notes: "Slow but steady",
    });

    // Second submit omits storageCapacity/notes entirely: they must not survive from the first.
    await t.withIdentity({ subject: secondScout }).mutation(api.pitReports.submit, {
      teamId,
      canScoreBalls: false,
      canClimb: true,
      driverRating: 5,
      defenseRating: 4,
      tags: ["Fast"],
    });

    const reports = await t.run((ctx) =>
      ctx.db
        .query("pitReports")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect(),
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].scoutId).toBe(secondScout);
    expect(reports[0].driverRating).toBe(5);
    expect(reports[0].tags).toEqual(["Fast"]);
    expect(reports[0].storageCapacity).toBeUndefined();
    expect(reports[0].notes).toBeUndefined();

    const fetched = await t.withIdentity({ subject: firstScout }).query(api.pitReports.getForTeam, {
      teamId,
    });
    expect(fetched?.driverRating).toBe(5);
    expect(fetched?.photoUrl).toBeNull();
    expect(fetched?.storageCapacity).toBeUndefined();
    expect(fetched?.notes).toBeUndefined();
  });
});

describe("authz on submit", () => {
  test("pitReports.submit and matchReports.submit reject unauthenticated callers", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);

    await expect(
      t.mutation(api.pitReports.submit, {
        teamId,
        canScoreBalls: true,
        canClimb: true,
        driverRating: 3,
        defenseRating: 3,
        tags: [],
      }),
    ).rejects.toThrow("Not signed in");

    await expect(
      t.mutation(api.matchReports.submit, {
        teamId,
        matchNumber: 1,
        ballsScored: 1,
        ballsMissed: 0,
        maxStorage: 1,
        climbAttempted: false,
        climbSucceeded: false,
        playedDefense: false,
        tags: [],
      }),
    ).rejects.toThrow("Not signed in");
  });
});

describe("matchReports.listForTeam", () => {
  test("tolerates a dangling matchId without throwing", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scoutId = await createUser(t, "scout");
    const danglingMatchId = await t.run((ctx) =>
      ctx.db.insert("matches", { eventId, matchNumber: 1, redTeams: [100], blueTeams: [200] }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("matchReports", {
        eventId,
        teamId,
        matchId: danglingMatchId,
        matchNumber: 1,
        scoutId,
        ballsScored: 5,
        ballsMissed: 1,
        maxStorage: 3,
        climbAttempted: true,
        climbSucceeded: true,
        playedDefense: false,
        tags: [],
      });
      await ctx.db.delete(danglingMatchId);
    });

    const reports = await t.withIdentity({ subject: scoutId }).query(api.matchReports.listForTeam, {
      teamId,
    });
    expect(reports).toHaveLength(1);
    expect(reports[0].matchId).toBe(danglingMatchId);
    expect(reports[0].scoutName).toBeNull();
  });
});

describe("stats.forEvent and stats.forTeam", () => {
  test("computes per-team stats and benchmark percentage against team 4788", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const benchmarkTeamId = await createTeam(t, eventId, BENCHMARK_TEAM);
    const scoutId = await createUser(t, "scout");

    await t.run(async (ctx) => {
      // Benchmark team: avgBalls = 20 -> throughputBps = 20/135
      await ctx.db.insert("matchReports", {
        eventId,
        teamId: benchmarkTeamId,
        matchNumber: 1,
        scoutId,
        ballsScored: 20,
        ballsMissed: 0,
        maxStorage: 5,
        climbAttempted: false,
        climbSucceeded: false,
        playedDefense: false,
        tags: [],
      });
      // Team 100: avgBalls = 10 -> throughputBps = 10/135 -> 50% of benchmark
      await ctx.db.insert("matchReports", {
        eventId,
        teamId,
        matchNumber: 1,
        scoutId,
        ballsScored: 8,
        ballsMissed: 2,
        maxStorage: 3,
        climbAttempted: true,
        climbSucceeded: true,
        playedDefense: false,
        tags: [],
      });
      await ctx.db.insert("matchReports", {
        eventId,
        teamId,
        matchNumber: 2,
        scoutId,
        ballsScored: 12,
        ballsMissed: 3,
        maxStorage: 3,
        climbAttempted: false,
        climbSucceeded: false,
        playedDefense: false,
        tags: [],
      });
    });

    const asScout = t.withIdentity({ subject: scoutId });
    const all = await asScout.query(api.stats.forEvent, {});

    expect(all[teamId].matchCount).toBe(2);
    expect(all[teamId].avgBalls).toBe(10);
    expect(all[teamId].accuracy).toBeCloseTo(20 / 25);
    expect(all[teamId].climbSuccessRate).toBe(1);
    expect(all[teamId].throughputPctOfBenchmark).toBeCloseTo(50);

    expect(all[benchmarkTeamId].throughputPctOfBenchmark).toBeCloseTo(100);

    const single = await asScout.query(api.stats.forTeam, { teamId });
    expect(single).toEqual(all[teamId]);
  });

  test("throughputPctOfBenchmark is null when team 4788 has no reports", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    await createTeam(t, eventId, BENCHMARK_TEAM);
    const scoutId = await createUser(t, "scout");

    await t.run((ctx) =>
      ctx.db.insert("matchReports", {
        eventId,
        teamId,
        matchNumber: 1,
        scoutId,
        ballsScored: 5,
        ballsMissed: 0,
        maxStorage: 2,
        climbAttempted: false,
        climbSucceeded: false,
        playedDefense: false,
        tags: [],
      }),
    );

    const all = await t.withIdentity({ subject: scoutId }).query(api.stats.forEvent, {});
    expect(all[teamId].throughputPctOfBenchmark).toBeNull();
  });

  test("stats.forTeam returns null when the team has no reports", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scoutId = await createUser(t, "scout");

    const single = await t.withIdentity({ subject: scoutId }).query(api.stats.forTeam, { teamId });
    expect(single).toBeNull();
  });
});
