import { describe, expect, test } from "vitest";
import { setupTest } from "./setup.helpers";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { bootstrapRole } from "../auth";

type Test = ReturnType<typeof setupTest>;

async function createUser(t: Test, role: "admin" | "scout") {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    await bootstrapRole(ctx, { userId, existingUserId: null });
    await ctx.db.patch(userId, { role });
    return userId;
  });
}

async function createEvent(t: Test) {
  return await t.run((ctx) =>
    ctx.db.insert("events", { tbaKey: "2026test", name: "Test Event", isActive: true }),
  );
}

async function createTeam(t: Test, eventId: Id<"events">, number: number) {
  return await t.run((ctx) =>
    ctx.db.insert("teams", { eventId, number, nickname: `Team ${number}` }),
  );
}

async function createMatch(
  t: Test,
  eventId: Id<"events">,
  fields: {
    matchNumber: number;
    redTeams: number[];
    blueTeams: number[];
    scheduledTime?: number;
    predictedTime?: number;
    actualTime?: number;
    redScore?: number;
    blueScore?: number;
  },
) {
  return await t.run((ctx) => ctx.db.insert("matches", { eventId, ...fields }));
}

describe("matches.upcoming", () => {
  test("drops played matches and orders the rest by best-known time", async () => {
    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    const eventId = await createEvent(t);

    // Q1 is done. Q2 is scheduled later than Q3, but Q3's prediction slipped
    // past it, so Q2 runs first.
    await createMatch(t, eventId, {
      matchNumber: 1,
      redTeams: [100, 101, 102],
      blueTeams: [200, 201, 202],
      actualTime: 1000,
      redScore: 50,
      blueScore: 40,
    });
    await createMatch(t, eventId, {
      matchNumber: 2,
      redTeams: [100, 101, 102],
      blueTeams: [200, 201, 202],
      scheduledTime: 5000,
      predictedTime: 6000,
    });
    await createMatch(t, eventId, {
      matchNumber: 3,
      redTeams: [100, 101, 102],
      blueTeams: [200, 201, 202],
      scheduledTime: 4000,
      predictedTime: 9000,
    });

    const result = await t.withIdentity({ subject: scoutId }).query(api.matches.upcoming, {});
    expect(result.matches.map((m) => m.matchNumber)).toEqual([2, 3]);
    expect(result.totalUpcoming).toBe(2);
    expect(result.matches[0].time).toBe(6000); // prediction beats the schedule
    expect(result.matches[0].timeIsPredicted).toBe(true);
  });

  test("falls back to match number when no times are known", async () => {
    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    const eventId = await createEvent(t);
    await createMatch(t, eventId, { matchNumber: 7, redTeams: [1], blueTeams: [2] });
    await createMatch(t, eventId, { matchNumber: 3, redTeams: [1], blueTeams: [2] });

    const result = await t.withIdentity({ subject: scoutId }).query(api.matches.upcoming, {});
    expect(result.matches.map((m) => m.matchNumber)).toEqual([3, 7]);
    expect(result.matches[0].time).toBeNull();
  });

  test("resolves alliance teams, watch flags, and scouting context", async () => {
    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    const eventId = await createEvent(t);
    const team100 = await createTeam(t, eventId, 100);
    await createTeam(t, eventId, 200);
    await createMatch(t, eventId, { matchNumber: 1, redTeams: [100], blueTeams: [200, 999] });

    const asScout = t.withIdentity({ subject: scoutId });
    await asScout.mutation(api.watchlist.toggle, { teamId: team100 });
    await t.run((ctx) =>
      ctx.db.insert("pitReports", {
        eventId,
        teamId: team100,
        scoutId,
        canScoreBalls: true,
        canClimb: false,
        ballsPerMatch: 12,
        driverRating: 4,
        defenseRating: 3,
        tags: [],
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("pitReports", {
        eventId,
        teamId: team100,
        scoutId,
        canScoreBalls: true,
        canClimb: true,
        hasAuto: true,
        driverRating: 4,
        defenseRating: 3,
        tags: [],
      }),
    );

    const { matches } = await asScout.query(api.matches.upcoming, {});
    const red = matches[0].red[0];
    expect(red).toMatchObject({
      number: 100,
      teamId: team100,
      nickname: "Team 100",
      watched: true,
      scoutCount: 2,
      ballsPerMatch: 12,
      climbRate: 0.5,
      autoRate: 0.5,
    });
    expect(matches[0].watchedCount).toBe(1);

    // 999 isn't on the roster (surrogate / stale import) but still shows up.
    const offRoster = matches[0].blue[1];
    expect(offRoster).toMatchObject({ number: 999, teamId: null, nickname: null, climbRate: null });
  });

  test("limit caps the returned matches without hiding the true count", async () => {
    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    const eventId = await createEvent(t);
    for (const matchNumber of [1, 2, 3]) {
      await createMatch(t, eventId, { matchNumber, redTeams: [1], blueTeams: [2] });
    }

    const result = await t
      .withIdentity({ subject: scoutId })
      .query(api.matches.upcoming, { limit: 2 });
    expect(result.matches).toHaveLength(2);
    expect(result.totalUpcoming).toBe(3);
  });

  test("requires a signed-in user", async () => {
    const t = setupTest();
    await createEvent(t);
    await expect(t.query(api.matches.upcoming, {})).rejects.toThrow("Not signed in");
  });
});

describe("watchlist", () => {
  test("toggle adds then removes, and listMine is sorted by team number", async () => {
    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    const eventId = await createEvent(t);
    const team100 = await createTeam(t, eventId, 100);
    const team50 = await createTeam(t, eventId, 50);
    const asScout = t.withIdentity({ subject: scoutId });

    expect(await asScout.mutation(api.watchlist.toggle, { teamId: team100 })).toBe(true);
    expect(await asScout.mutation(api.watchlist.toggle, { teamId: team50 })).toBe(true);
    expect(await asScout.query(api.watchlist.listMine, {})).toEqual([
      { teamId: team50, number: 50, nickname: "Team 50" },
      { teamId: team100, number: 100, nickname: "Team 100" },
    ]);

    expect(await asScout.mutation(api.watchlist.toggle, { teamId: team100 })).toBe(false);
    expect(await asScout.query(api.watchlist.listMine, {})).toHaveLength(1);
  });

  test("watch lists are per-scout", async () => {
    const t = setupTest();
    const scoutA = await createUser(t, "scout");
    const scoutB = await createUser(t, "scout");
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);

    await t.withIdentity({ subject: scoutA }).mutation(api.watchlist.toggle, { teamId });

    expect(await t.withIdentity({ subject: scoutA }).query(api.watchlist.listMine, {})).toHaveLength(1);
    expect(await t.withIdentity({ subject: scoutB }).query(api.watchlist.listMine, {})).toHaveLength(0);

    const teams = await t.withIdentity({ subject: scoutB }).query(api.teams.listWithStatus, {});
    expect(teams[0].watchedByMe).toBe(false);
  });

  test("deleting a team clears its watch rows", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const asAdmin = t.withIdentity({ subject: adminId });

    await asAdmin.mutation(api.watchlist.toggle, { teamId });
    await asAdmin.mutation(api.teams.remove, { teamId });

    expect(await t.run((ctx) => ctx.db.query("watchlist").collect())).toHaveLength(0);
    expect(await asAdmin.query(api.watchlist.listMine, {})).toHaveLength(0);
  });

  test("requires a signed-in user", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    await expect(t.mutation(api.watchlist.toggle, { teamId })).rejects.toThrow("Not signed in");
  });
});
