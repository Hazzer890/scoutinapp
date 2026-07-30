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
  test("scouts do not overwrite each other; resubmit replaces only the caller's report", async () => {
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
    expect(reports).toHaveLength(2);
    expect(new Set(reports.map((r) => r.scoutId))).toEqual(new Set([firstScout, secondScout]));

    // Resubmit by the first scout replaces their report only. Omitted optional
    // fields (storageCapacity, notes) must not survive from their first submit.
    await t.withIdentity({ subject: firstScout }).mutation(api.pitReports.submit, {
      teamId,
      canScoreBalls: true,
      canClimb: true,
      driverRating: 3,
      defenseRating: 3,
      tags: [],
    });

    const after = await t.run((ctx) =>
      ctx.db
        .query("pitReports")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect(),
    );
    expect(after).toHaveLength(2);
    const firstReport = after.find((r) => r.scoutId === firstScout);
    const secondReport = after.find((r) => r.scoutId === secondScout);
    expect(firstReport?.driverRating).toBe(3);
    expect(firstReport?.storageCapacity).toBeUndefined();
    expect(firstReport?.notes).toBeUndefined();
    expect(secondReport?.driverRating).toBe(5);
  });
});

describe("authz on submit", () => {
  test("pitReports.submit rejects unauthenticated callers", async () => {
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
  });
});

async function submitPit(
  t: Test,
  scoutId: Id<"users">,
  teamId: Id<"teams">,
  ballsPerMatch?: number,
) {
  await t.withIdentity({ subject: scoutId }).mutation(api.pitReports.submit, {
    teamId,
    canScoreBalls: true,
    canClimb: false,
    ballsPerMatch,
    driverRating: 3,
    defenseRating: 3,
    tags: [],
  });
}

describe("pitReports.getMine and aggregateForTeam", () => {
  test("getMine returns only the caller's report", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scoutA = await createUser(t, "scout");
    const scoutB = await createUser(t, "scout");

    await submitPit(t, scoutA, teamId, 4);

    const mine = await t.withIdentity({ subject: scoutA }).query(api.pitReports.getMine, { teamId });
    expect(mine?.scoutId).toBe(scoutA);
    expect(mine?.ballsPerMatch).toBe(4);
    expect(mine?.photoUrl).toBeNull();

    const theirs = await t.withIdentity({ subject: scoutB }).query(api.pitReports.getMine, { teamId });
    expect(theirs).toBeNull();
  });

  test("aggregateForTeam averages across scouts and resolves note names", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scoutA = await createUser(t, "scout");
    const scoutB = await createUser(t, "scout");
    await t.run((ctx) => ctx.db.patch(scoutA, { name: "Alice" }));

    await t.withIdentity({ subject: scoutA }).mutation(api.pitReports.submit, {
      teamId,
      canScoreBalls: true,
      canClimb: true,
      ballsPerMatch: 4,
      driverRating: 5,
      defenseRating: 2,
      tags: ["Fast"],
      notes: "solid",
    });
    await t.withIdentity({ subject: scoutB }).mutation(api.pitReports.submit, {
      teamId,
      canScoreBalls: true,
      canClimb: false,
      ballsPerMatch: 5,
      driverRating: 2,
      defenseRating: 3,
      tags: ["Fast", "Tippy"],
    });

    const agg = await t
      .withIdentity({ subject: scoutA })
      .query(api.pitReports.aggregateForTeam, { teamId });
    expect(agg?.scoutCount).toBe(2);
    expect(agg?.canClimb).toEqual({ yes: 1, total: 2 });
    expect(agg?.ballsPerMatch).toBe(4.5);
    expect(agg?.driverRating).toBe(3.5);
    expect(agg?.tags).toEqual([
      { tag: "Fast", count: 2 },
      { tag: "Tippy", count: 1 },
    ]);
    expect(agg?.notes).toEqual([{ scoutName: "Alice", note: "solid" }]);
    expect(agg?.photoUrl).toBeNull();

    const empty = await t
      .withIdentity({ subject: scoutA })
      .query(api.pitReports.aggregateForTeam, { teamId: await createTeam(t, eventId, 200) });
    expect(empty).toBeNull();
  });
});

describe("pitReports.leaderboard", () => {
  test("ranks by count desc, ties broken by earliest finish", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamA = await createTeam(t, eventId, 100);
    const teamB = await createTeam(t, eventId, 200);
    const alice = await createUser(t, "scout");
    const bob = await createUser(t, "scout");
    const carol = await createUser(t, "scout");
    await t.run((ctx) => ctx.db.patch(alice, { name: "Alice" }));
    await t.run((ctx) => ctx.db.patch(bob, { name: "Bob" }));

    // Bob scouts 2 teams and finishes before Alice scouts her 2 teams.
    await submitPit(t, bob, teamA);
    await submitPit(t, bob, teamB);
    await submitPit(t, alice, teamA);
    await submitPit(t, alice, teamB);
    // Carol scouts 1 team. Unnamed → "Scout".
    await submitPit(t, carol, teamA);
    // Alice edits an existing report — must NOT reset her finish time.
    await submitPit(t, alice, teamA, 9);

    const board = await t.withIdentity({ subject: alice }).query(api.pitReports.leaderboard, {});
    expect(board).toEqual([
      { scoutId: bob, scoutName: "Bob", count: 2 },
      { scoutId: alice, scoutName: "Alice", count: 2 },
      { scoutId: carol, scoutName: "Scout", count: 1 },
    ]);
  });

  test("returns [] when there is no active event", async () => {
    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    const board = await t.withIdentity({ subject: scoutId }).query(api.pitReports.leaderboard, {});
    expect(board).toEqual([]);
  });
});

describe("stats.forEvent and stats.forTeam", () => {
  test("reports ballsPerMatch and percentage of benchmark team 4788", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const benchmarkTeamId = await createTeam(t, eventId, BENCHMARK_TEAM);
    const scoutId = await createUser(t, "scout");

    await submitPit(t, scoutId, benchmarkTeamId, 20);
    await submitPit(t, scoutId, teamId, 10);

    const asScout = t.withIdentity({ subject: scoutId });
    const all = await asScout.query(api.stats.forEvent, {});

    expect(all[teamId].ballsPerMatch).toBe(10);
    expect(all[teamId].pctOfBenchmark).toBeCloseTo(50);
    expect(all[benchmarkTeamId].pctOfBenchmark).toBeCloseTo(100);

    const single = await asScout.query(api.stats.forTeam, { teamId });
    expect(single).toEqual(all[teamId]);
  });

  test("pctOfBenchmark is null when team 4788 has no estimate", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    await createTeam(t, eventId, BENCHMARK_TEAM);
    const scoutId = await createUser(t, "scout");

    await submitPit(t, scoutId, teamId, 5);

    const all = await t.withIdentity({ subject: scoutId }).query(api.stats.forEvent, {});
    expect(all[teamId].pctOfBenchmark).toBeNull();
  });

  test("ballsPerMatch and benchmark use per-team means across scouts", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const benchmarkTeamId = await createTeam(t, eventId, BENCHMARK_TEAM);
    const scoutA = await createUser(t, "scout");
    const scoutB = await createUser(t, "scout");

    await submitPit(t, scoutA, teamId, 4);
    await submitPit(t, scoutB, teamId, 6); // mean 5
    await submitPit(t, scoutA, benchmarkTeamId, 10);
    await submitPit(t, scoutB, benchmarkTeamId, 30); // mean 20

    const all = await t.withIdentity({ subject: scoutA }).query(api.stats.forEvent, {});
    expect(all[teamId].ballsPerMatch).toBe(5);
    expect(all[teamId].pctOfBenchmark).toBeCloseTo(25);
    expect(all[benchmarkTeamId].pctOfBenchmark).toBeCloseTo(100);
  });

  test("stats.forTeam returns null when the team has no ball estimate", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scoutId = await createUser(t, "scout");

    // A pit report without ballsPerMatch yields no stats entry.
    await submitPit(t, scoutId, teamId, undefined);

    const single = await t.withIdentity({ subject: scoutId }).query(api.stats.forTeam, { teamId });
    expect(single).toBeNull();
  });
});
