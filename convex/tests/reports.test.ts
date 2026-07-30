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
