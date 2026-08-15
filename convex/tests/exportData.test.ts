import { describe, expect, test } from "vitest";
import { setupTest } from "./setup.helpers";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { bootstrapRole } from "../auth";

type Test = ReturnType<typeof setupTest>;

async function createUser(t: Test, role: "admin" | "scout", name: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    await bootstrapRole(ctx, { userId, existingUserId: null });
    await ctx.db.patch(userId, { role, name });
    return userId;
  });
}

async function createEvent(t: Test, tbaKey: string, isActive: boolean) {
  return await t.run((ctx) =>
    ctx.db.insert("events", { tbaKey, name: `Event ${tbaKey}`, isActive }),
  );
}

async function createTeam(t: Test, eventId: Id<"events">, number: number) {
  return await t.run((ctx) =>
    ctx.db.insert("teams", { eventId, number, nickname: `Team ${number}` }),
  );
}

async function seedEvent(t: Test, tbaKey = "2026test", isActive = true) {
  const eventId = await createEvent(t, tbaKey, isActive);
  const teamId = await createTeam(t, eventId, 4788);
  const scoutId = await createUser(t, "scout", "Ada");

  await t.run(async (ctx) => {
    await ctx.db.insert("matches", {
      eventId,
      matchNumber: 1,
      redTeams: [4788, 1, 2],
      blueTeams: [3, 4, 5],
      redScore: 90,
      blueScore: 40,
      actualTime: 1000,
    });
    await ctx.db.insert("matches", {
      eventId,
      matchNumber: 2,
      redTeams: [4788, 6, 7],
      blueTeams: [8, 9, 10],
      predictedTime: 2000,
    });
    await ctx.db.insert("pitReports", {
      eventId,
      teamId,
      scoutId,
      canScoreBalls: true,
      canClimb: false,
      driverRating: 4,
      defenseRating: 2,
      tags: ["Fast"],
      notes: "Strong auto",
    });
    await ctx.db.insert("picklists", {
      eventId,
      ownerId: scoutId,
      entries: [{ teamId, tier: "A" as const, rank: 0 }],
    });
    await ctx.db.insert("picklists", {
      eventId,
      entries: [{ teamId, tier: "S" as const, rank: 0 }],
    });
  });

  return { eventId, teamId, scoutId };
}

describe("exportData.scoutingData", () => {
  test("dumps the active event with teams, matches, reports and both picklists", async () => {
    const t = setupTest();
    const { teamId } = await seedEvent(t);

    const data = await t.query(internal.exportData.scoutingData, {});
    expect(data).not.toBeNull();
    if (!data) return;

    expect(data.event.tbaKey).toBe("2026test");
    expect(data.teams).toHaveLength(1);
    expect(data.teams[0]).toMatchObject({ id: teamId, number: 4788, nickname: "Team 4788" });

    expect(data.matches.map((m) => m.played)).toEqual([true, false]);

    expect(data.pitReports).toHaveLength(1);
    expect(data.pitReports[0]).toMatchObject({
      teamId,
      teamNumber: 4788,
      scout: "Scout 1",
      notes: "Strong auto",
      photoUrl: null,
    });

    const kinds = data.picklists.map((list) => list.kind).sort();
    expect(kinds).toEqual(["personal", "primary"]);
    const primary = data.picklists.find((list) => list.kind === "primary")!;
    expect(primary.owner).toBeNull();
    const personal = data.picklists.find((list) => list.kind === "personal")!;
    // Same scout, so the picklist carries the same pseudonym as their report.
    expect(personal.owner).toBe("Scout 1");
    // Entries carry the team number so consumers need not join on Convex ids.
    expect(personal.entries[0]).toMatchObject({ teamId, teamNumber: 4788, tier: "A", rank: 0 });
  });

  test("eventKey selects a non-active event", async () => {
    const t = setupTest();
    await seedEvent(t, "2026active", true);
    await seedEvent(t, "2026past", false);

    const active = await t.query(internal.exportData.scoutingData, {});
    expect(active?.event.tbaKey).toBe("2026active");

    const past = await t.query(internal.exportData.scoutingData, { eventKey: "2026past" });
    expect(past?.event.tbaKey).toBe("2026past");
    expect(past?.event.isActive).toBe(false);
    // Scoped to that event only — the active event's rows must not leak in.
    expect(past?.pitReports).toHaveLength(1);
  });

  test("returns null when there is no active event and for an unknown key", async () => {
    const t = setupTest();
    expect(await t.query(internal.exportData.scoutingData, {})).toBeNull();
    await seedEvent(t);
    expect(await t.query(internal.exportData.scoutingData, { eventKey: "nope" })).toBeNull();
  });
});

describe("exportData scout anonymisation", () => {
  test("no name, email or user id reaches the payload", async () => {
    const t = setupTest();
    const eventId = await createEvent(t, "2026test", true);
    const teamId = await createTeam(t, eventId, 4788);
    const scoutId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      await bootstrapRole(ctx, { userId, existingUserId: null });
      await ctx.db.patch(userId, { role: "scout", name: "Ada Lovelace", email: "ada@example.com" });
      return userId;
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("pitReports", {
        eventId,
        teamId,
        scoutId,
        canScoreBalls: true,
        canClimb: false,
        driverRating: 4,
        defenseRating: 2,
        tags: [],
      });
      await ctx.db.insert("picklists", {
        eventId,
        ownerId: scoutId,
        entries: [{ teamId, tier: "A" as const, rank: 0 }],
      });
    });

    const data = await t.query(internal.exportData.scoutingData, {});
    const serialised = JSON.stringify(data);
    expect(serialised).not.toContain("Ada Lovelace");
    expect(serialised).not.toContain("ada@example.com");
    expect(serialised).not.toContain(scoutId);
    expect(data?.pitReports[0].scout).toBe("Scout 1");
  });

  test("distinct scouts get distinct labels, and one scout keeps one label", async () => {
    const t = setupTest();
    const eventId = await createEvent(t, "2026test", true);
    const teamA = await createTeam(t, eventId, 1);
    const teamB = await createTeam(t, eventId, 2);
    const first = await createUser(t, "scout", "Ada");
    const second = await createUser(t, "scout", "Bea");

    await t.run(async (ctx) => {
      // first scouts both teams, second scouts one — so a correct labelling has
      // two labels over three rows, not three.
      for (const [scoutId, teamId] of [
        [first, teamA],
        [first, teamB],
        [second, teamA],
      ] as const) {
        await ctx.db.insert("pitReports", {
          eventId,
          teamId,
          scoutId,
          canScoreBalls: true,
          canClimb: false,
          driverRating: 3,
          defenseRating: 3,
          tags: [],
        });
      }
    });

    const data = await t.query(internal.exportData.scoutingData, {});
    const labels = data!.pitReports.map((report) => report.scout);
    expect(labels).toEqual(["Scout 1", "Scout 1", "Scout 2"]);
  });

  test("labels are stable across calls and when a new scout joins", async () => {
    const t = setupTest();
    const eventId = await createEvent(t, "2026test", true);
    const teamId = await createTeam(t, eventId, 1);
    const first = await createUser(t, "scout", "Ada");
    const second = await createUser(t, "scout", "Bea");

    const insertReport = (scoutId: Id<"users">) =>
      t.run((ctx) =>
        ctx.db.insert("pitReports", {
          eventId,
          teamId,
          scoutId,
          canScoreBalls: true,
          canClimb: false,
          driverRating: 3,
          defenseRating: 3,
          tags: [],
        }),
      );

    await insertReport(first);
    const before = await t.query(internal.exportData.scoutingData, {});
    const firstLabel = before!.pitReports[0].scout;

    // Same data, second call: a consumer polling must not see labels shuffle.
    const again = await t.query(internal.exportData.scoutingData, {});
    expect(again!.pitReports[0].scout).toBe(firstLabel);

    // A newcomer is appended rather than renumbering the existing scout.
    await insertReport(second);
    const after = await t.query(internal.exportData.scoutingData, {});
    expect(after!.pitReports[0].scout).toBe(firstLabel);
    expect(after!.pitReports[1].scout).toBe("Scout 2");
  });
});

describe("GET /api/scouting", () => {
  test("serves the dump as JSON without any credentials", async () => {
    const t = setupTest();
    await seedEvent(t);

    const response = await t.fetch("/api/scouting", { method: "GET" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await response.json();
    expect(body.event.tbaKey).toBe("2026test");
    expect(body.teams).toHaveLength(1);
    expect(body.pitReports[0].scout).toBe("Scout 1");
    // The seeded scout is named "Ada"; the public payload must not say so.
    expect(JSON.stringify(body)).not.toContain("Ada");
    expect(typeof body.exportedAt).toBe("number");
  });

  test("?event= picks the event by TBA key", async () => {
    const t = setupTest();
    await seedEvent(t, "2026active", true);
    await seedEvent(t, "2026past", false);

    const response = await t.fetch("/api/scouting?event=2026past", { method: "GET" });
    expect(response.status).toBe(200);
    expect((await response.json()).event.tbaKey).toBe("2026past");
  });

  test("404s with an explanatory error when the event is missing", async () => {
    const t = setupTest();

    const noActive = await t.fetch("/api/scouting", { method: "GET" });
    expect(noActive.status).toBe(404);
    expect((await noActive.json()).error).toContain("No active event");

    await seedEvent(t);
    const unknown = await t.fetch("/api/scouting?event=nope", { method: "GET" });
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error).toContain("nope");
  });

  test("OPTIONS preflight is allowed", async () => {
    const t = setupTest();
    const response = await t.fetch("/api/scouting", { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});
