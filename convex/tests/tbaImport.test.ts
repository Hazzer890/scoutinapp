import { describe, expect, test, vi } from "vitest";
import { setupTest } from "./setup.helpers";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { bootstrapRole } from "../auth";
import {
  mapTbaTeam,
  mapTbaMatch,
  mapQualMatches,
  isUpcoming,
  compareByPlayOrder,
} from "../lib/tbaMapping";

type Test = ReturnType<typeof setupTest>;

async function createUser(t: Test, role: "admin" | "scout") {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    await bootstrapRole(ctx, { userId, existingUserId: null });
    await ctx.db.patch(userId, { role });
    return userId;
  });
}

describe("TBA response mapping", () => {
  test("mapTbaTeam falls back to team number as nickname", () => {
    expect(
      mapTbaTeam({ key: "frc4788", team_number: 4788, nickname: null, city: "Rye", state_prov: "NH", country: "USA" }),
    ).toEqual({
      tbaKey: "frc4788",
      number: 4788,
      nickname: "4788",
      city: "Rye",
      stateProv: "NH",
      country: "USA",
    });
    expect(mapTbaTeam({ key: "frc254", team_number: 254, nickname: "The Cheesy Poofs" }).nickname).toBe(
      "The Cheesy Poofs",
    );
  });

  test("mapTbaMatch strips the frc prefix from team keys and converts time to ms", () => {
    const row = mapTbaMatch({
      key: "2026test_qm1",
      comp_level: "qm",
      match_number: 1,
      alliances: { red: { team_keys: ["frc100", "frc200"] }, blue: { team_keys: ["frc300", "frc400"] } },
      time: 1700000000,
    });
    expect(row).toEqual({
      tbaKey: "2026test_qm1",
      matchNumber: 1,
      redTeams: [100, 200],
      blueTeams: [300, 400],
      scheduledTime: 1700000000000,
    });
  });

  test("mapTbaMatch leaves scheduledTime undefined when time is absent", () => {
    const row = mapTbaMatch({
      key: "2026test_qm1",
      comp_level: "qm",
      match_number: 1,
      alliances: { red: { team_keys: ["frc100"] }, blue: { team_keys: ["frc200"] } },
    });
    expect(row.scheduledTime).toBeUndefined();
  });

  test("mapTbaMatch carries predicted/actual times and only real scores", () => {
    const base = {
      key: "2026test_qm1",
      comp_level: "qm",
      match_number: 1,
      alliances: { red: { team_keys: ["frc100"] }, blue: { team_keys: ["frc200"] } },
    };

    const unplayed = mapTbaMatch({
      ...base,
      time: 1700000000,
      predicted_time: 1700000600,
      alliances: {
        red: { team_keys: ["frc100"], score: -1 },
        blue: { team_keys: ["frc200"], score: -1 },
      },
    });
    expect(unplayed.predictedTime).toBe(1700000600000);
    expect(unplayed.actualTime).toBeUndefined();
    expect(unplayed.redScore).toBeUndefined();
    expect(isUpcoming(unplayed)).toBe(true);

    const played = mapTbaMatch({
      ...base,
      time: 1700000000,
      actual_time: 1700000900,
      alliances: {
        red: { team_keys: ["frc100"], score: 88 },
        blue: { team_keys: ["frc200"], score: 71 },
      },
    });
    expect(played.actualTime).toBe(1700000900000);
    expect(played.redScore).toBe(88);
    expect(played.blueScore).toBe(71);
    expect(isUpcoming(played)).toBe(false);
  });

  test("compareByPlayOrder prefers actual, then predicted, then scheduled time", () => {
    const sorted = [
      { matchNumber: 1, scheduledTime: 3000, predictedTime: 9000 },
      { matchNumber: 2, scheduledTime: 4000 },
      { matchNumber: 3, scheduledTime: 5000, actualTime: 1000, predictedTime: 8000 },
    ].sort(compareByPlayOrder);
    expect(sorted.map((m) => m.matchNumber)).toEqual([3, 2, 1]);

    // No times anywhere: fall back to match number.
    expect([{ matchNumber: 9 }, { matchNumber: 4 }].sort(compareByPlayOrder).map((m) => m.matchNumber)).toEqual(
      [4, 9],
    );
  });

  test("mapQualMatches drops non-qualification matches", () => {
    const rows = mapQualMatches([
      {
        key: "2026test_qm1",
        comp_level: "qm",
        match_number: 1,
        alliances: { red: { team_keys: ["frc100"] }, blue: { team_keys: ["frc200"] } },
      },
      {
        key: "2026test_sf1m1",
        comp_level: "sf",
        match_number: 1,
        alliances: { red: { team_keys: ["frc100"] }, blue: { team_keys: ["frc200"] } },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].tbaKey).toBe("2026test_qm1");
  });
});

describe("tbaImport.applyImport", () => {
  test("upserts event, teams, and matches; re-importing is idempotent", async () => {
    const t = setupTest();

    const firstResult = await t.mutation(internal.tbaImport.applyImport, {
      eventKey: "2026test",
      eventName: "Test Event",
      teams: [{ tbaKey: "frc100", number: 100, nickname: "Team 100" }],
      matches: [{ tbaKey: "2026test_qm1", matchNumber: 1, redTeams: [100], blueTeams: [200] }],
    });
    expect(firstResult).toEqual({ teams: 1, matches: 1 });

    const event = await t.run((ctx) =>
      ctx.db
        .query("events")
        .withIndex("by_tba_key", (q) => q.eq("tbaKey", "2026test"))
        .first(),
    );
    expect(event?.isActive).toBe(true);
    const eventId = event!._id;

    // Re-import with an updated nickname/time for the same tbaKeys.
    await t.mutation(internal.tbaImport.applyImport, {
      eventKey: "2026test",
      eventName: "Test Event",
      teams: [{ tbaKey: "frc100", number: 100, nickname: "Renamed Team" }],
      matches: [
        { tbaKey: "2026test_qm1", matchNumber: 1, redTeams: [100], blueTeams: [200], scheduledTime: 123 },
      ],
    });

    const teams = await t.run((ctx) =>
      ctx.db
        .query("teams")
        .withIndex("by_event_number", (q) => q.eq("eventId", eventId))
        .collect(),
    );
    const matches = await t.run((ctx) =>
      ctx.db
        .query("matches")
        .withIndex("by_event_match", (q) => q.eq("eventId", eventId))
        .collect(),
    );
    expect(teams).toHaveLength(1);
    expect(teams[0].nickname).toBe("Renamed Team");
    expect(matches).toHaveLength(1);
    expect(matches[0].scheduledTime).toBe(123);
  });

  test("never touches manually-entered teams (no tbaKey)", async () => {
    const t = setupTest();
    const eventId: Id<"events"> = await t.run((ctx) =>
      ctx.db.insert("events", { tbaKey: "2026test", name: "Test Event", isActive: true }),
    );
    const manualTeamId = await t.run((ctx) =>
      ctx.db.insert("teams", { eventId, number: 900, nickname: "Manual Team" }),
    );

    await t.mutation(internal.tbaImport.applyImport, {
      eventKey: "2026test",
      eventName: "Test Event",
      teams: [{ tbaKey: "frc100", number: 100, nickname: "Team 100" }],
      matches: [],
    });

    const manualTeam = await t.run((ctx) => ctx.db.get(manualTeamId));
    expect(manualTeam?.nickname).toBe("Manual Team");
    expect(manualTeam?.tbaKey).toBeUndefined();

    const allTeams = await t.run((ctx) =>
      ctx.db
        .query("teams")
        .withIndex("by_event_number", (q) => q.eq("eventId", eventId))
        .collect(),
    );
    expect(allTeams).toHaveLength(2);
  });

  test("adopts a manual team when its number matches an incoming TBA team", async () => {
    const t = setupTest();
    const eventId: Id<"events"> = await t.run((ctx) =>
      ctx.db.insert("events", { tbaKey: "2026test", name: "Test Event", isActive: true }),
    );
    const manualTeamId = await t.run((ctx) =>
      ctx.db.insert("teams", { eventId, number: 100, nickname: "Manual Team 100" }),
    );

    await t.mutation(internal.tbaImport.applyImport, {
      eventKey: "2026test",
      eventName: "Test Event",
      teams: [{ tbaKey: "frc100", number: 100, nickname: "Team 100" }],
      matches: [],
    });

    const allTeams = await t.run((ctx) =>
      ctx.db
        .query("teams")
        .withIndex("by_event_number", (q) => q.eq("eventId", eventId))
        .collect(),
    );
    expect(allTeams).toHaveLength(1);
    expect(allTeams[0]._id).toBe(manualTeamId);
    expect(allTeams[0].tbaKey).toBe("frc100");
    expect(allTeams[0].nickname).toBe("Team 100");
  });
});

describe("tba.refreshMatches", () => {
  function stubMatchesFetch(matches: unknown[]) {
    vi.stubEnv("TBA_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(matches))));
  }

  test("a scout can refresh the active event's schedule", async () => {
    stubMatchesFetch([
      {
        key: "2026test_qm1",
        comp_level: "qm",
        match_number: 1,
        alliances: {
          red: { team_keys: ["frc100"], score: 60 },
          blue: { team_keys: ["frc200"], score: 55 },
        },
        time: 1700000000,
        actual_time: 1700000100,
      },
      {
        key: "2026test_qm2",
        comp_level: "qm",
        match_number: 2,
        alliances: {
          red: { team_keys: ["frc100"], score: -1 },
          blue: { team_keys: ["frc200"], score: -1 },
        },
        time: 1700000600,
        predicted_time: 1700000900,
      },
      {
        key: "2026test_f1m1",
        comp_level: "f",
        match_number: 1,
        alliances: { red: { team_keys: ["frc100"] }, blue: { team_keys: ["frc200"] } },
      },
    ]);

    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    const eventId: Id<"events"> = await t.run((ctx) =>
      ctx.db.insert("events", { tbaKey: "2026test", name: "Test Event", isActive: true }),
    );

    const result = await t.withIdentity({ subject: scoutId }).action(api.tba.refreshMatches, {});
    expect(result).toEqual({ ok: true, upcoming: 1, total: 2 }); // the final was filtered out

    const matches = await t.run((ctx) =>
      ctx.db
        .query("matches")
        .withIndex("by_event_match", (q) => q.eq("eventId", eventId))
        .collect(),
    );
    expect(matches).toHaveLength(2);
    const qm2 = matches.find((m) => m.matchNumber === 2)!;
    expect(qm2.predictedTime).toBe(1700000900000);
    expect(qm2.redScore).toBeUndefined();

    const event = await t.run((ctx) => ctx.db.get(eventId));
    expect(event?.matchesSyncedAt).toBeTypeOf("number");

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("clears a stale predicted time that TBA no longer reports", async () => {
    stubMatchesFetch([
      {
        key: "2026test_qm1",
        comp_level: "qm",
        match_number: 1,
        alliances: {
          red: { team_keys: ["frc100"], score: -1 },
          blue: { team_keys: ["frc200"], score: -1 },
        },
        time: 1700000000,
      },
    ]);

    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    const eventId: Id<"events"> = await t.run((ctx) =>
      ctx.db.insert("events", { tbaKey: "2026test", name: "Test Event", isActive: true }),
    );
    await t.run((ctx) =>
      ctx.db.insert("matches", {
        eventId,
        tbaKey: "2026test_qm1",
        matchNumber: 1,
        redTeams: [100],
        blueTeams: [200],
        predictedTime: 1699999999000,
      }),
    );

    await t.withIdentity({ subject: scoutId }).action(api.tba.refreshMatches, {});

    const matches = await t.run((ctx) =>
      ctx.db
        .query("matches")
        .withIndex("by_event_match", (q) => q.eq("eventId", eventId))
        .collect(),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].predictedTime).toBeUndefined();

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("rejects anonymous callers and reports a missing active event", async () => {
    vi.stubEnv("TBA_API_KEY", "test-key");
    const t = setupTest();

    expect(await t.action(api.tba.refreshMatches, {})).toEqual({
      ok: false,
      error: "Not signed in",
    });

    const scoutId = await createUser(t, "scout");
    expect(await t.withIdentity({ subject: scoutId }).action(api.tba.refreshMatches, {})).toEqual({
      ok: false,
      error: "No active event",
    });

    vi.unstubAllEnvs();
  });
});

describe("tba.importEvent", () => {
  test("returns an error when TBA_API_KEY is not configured", async () => {
    vi.stubEnv("TBA_API_KEY", "");
    const t = setupTest();
    const adminId = await createUser(t, "admin");

    const result = await t.withIdentity({ subject: adminId }).action(api.tba.importEvent, {
      eventKey: "2026test",
    });

    expect(result).toEqual({
      ok: false,
      error: "TBA_API_KEY is not configured. Set it with `npx convex env set TBA_API_KEY <key>`.",
    });
    vi.unstubAllEnvs();
  });

  test("rejects non-admins before checking the API key", async () => {
    vi.stubEnv("TBA_API_KEY", "");
    const t = setupTest();
    const scoutId = await createUser(t, "scout");

    const result = await t.withIdentity({ subject: scoutId }).action(api.tba.importEvent, {
      eventKey: "2026test",
    });

    expect(result).toEqual({ ok: false, error: "Admin only" });
    vi.unstubAllEnvs();
  });

  test("success path: fetches, maps, imports, and returns ok:true", async () => {
    vi.stubEnv("TBA_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/matches/simple")) {
          return new Response(
            JSON.stringify([
              {
                key: "2026test_qm1",
                comp_level: "qm",
                match_number: 1,
                alliances: { red: { team_keys: ["frc100"] }, blue: { team_keys: ["frc200"] } },
                time: 1700000000,
              },
              {
                key: "2026test_sf1m1",
                comp_level: "sf",
                match_number: 1,
                alliances: { red: { team_keys: ["frc100"] }, blue: { team_keys: ["frc200"] } },
              },
            ]),
          );
        }
        if (url.endsWith("/teams/simple")) {
          return new Response(
            JSON.stringify([
              { key: "frc100", team_number: 100, nickname: "Team 100" },
              { key: "frc200", team_number: 200, nickname: "Team 200" },
            ]),
          );
        }
        return new Response(JSON.stringify({ name: "Test Event" }));
      }),
    );

    const t = setupTest();
    const adminId = await createUser(t, "admin");

    const result = await t.withIdentity({ subject: adminId }).action(api.tba.importEvent, {
      eventKey: "2026test",
    });
    expect(result).toEqual({ ok: true, teams: 2, matches: 1 });

    const event = await t.run((ctx) =>
      ctx.db
        .query("events")
        .withIndex("by_tba_key", (q) => q.eq("tbaKey", "2026test"))
        .first(),
    );
    expect(event?.name).toBe("Test Event");
    expect(event?.isActive).toBe(true);

    const teams = await t.run((ctx) =>
      ctx.db
        .query("teams")
        .withIndex("by_event_number", (q) => q.eq("eventId", event!._id))
        .collect(),
    );
    expect(teams.map((team) => team.number).sort()).toEqual([100, 200]);

    const matches = await t.run((ctx) =>
      ctx.db
        .query("matches")
        .withIndex("by_event_match", (q) => q.eq("eventId", event!._id))
        .collect(),
    );
    expect(matches).toHaveLength(1); // the sf match was filtered out
    expect(matches[0].redTeams).toEqual([100]);
    expect(matches[0].blueTeams).toEqual([200]);
    expect(matches[0].scheduledTime).toBe(1700000000000);

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
