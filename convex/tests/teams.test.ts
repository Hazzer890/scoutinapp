import { describe, expect, test } from "vitest";
import { setupTest } from "./setup";
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

describe("mutation role enforcement", () => {
  test("scouts are rejected by admin-only mutations", async () => {
    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const asScout = t.withIdentity({ subject: scoutId });

    await expect(
      asScout.mutation(api.events.setActive, { tbaKey: "2027test", name: "Other" }),
    ).rejects.toThrow("Admin only");
    await expect(
      asScout.mutation(api.teams.upsertManual, { number: 200, nickname: "New Team" }),
    ).rejects.toThrow("Admin only");
    await expect(asScout.mutation(api.teams.remove, { teamId })).rejects.toThrow(
      "Admin only",
    );
    await expect(
      asScout.mutation(api.matches.upsertManual, {
        matchNumber: 1,
        redTeams: [100],
        blueTeams: [200],
      }),
    ).rejects.toThrow("Admin only");
  });

  test("admins can call admin-only mutations", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const asAdmin = t.withIdentity({ subject: adminId });

    const eventId = await asAdmin.mutation(api.events.setActive, {
      tbaKey: "2026test",
      name: "Test Event",
    });
    expect(eventId).toBeTruthy();

    const teamId = await asAdmin.mutation(api.teams.upsertManual, {
      number: 100,
      nickname: "Team 100",
    });
    expect(teamId).toBeTruthy();

    const matchId = await asAdmin.mutation(api.matches.upsertManual, {
      matchNumber: 1,
      redTeams: [100],
      blueTeams: [200],
    });
    expect(matchId).toBeTruthy();

    expect(await asAdmin.mutation(api.matches.remove, { matchId })).toBeNull();
    expect(await asAdmin.mutation(api.teams.remove, { teamId })).toBeNull();
  });
});

describe("events.setActive", () => {
  test("deactivates the previous event and upserts by tbaKey", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const asAdmin = t.withIdentity({ subject: adminId });

    const firstId = await asAdmin.mutation(api.events.setActive, {
      tbaKey: "2026first",
      name: "First Event",
    });
    const secondId = await asAdmin.mutation(api.events.setActive, {
      tbaKey: "2026second",
      name: "Second Event",
    });

    const first = await t.run((ctx) => ctx.db.get(firstId));
    const second = await t.run((ctx) => ctx.db.get(secondId));
    expect(first?.isActive).toBe(false);
    expect(second?.isActive).toBe(true);

    const active = await asAdmin.query(api.events.getActive, {});
    expect(active?._id).toBe(secondId);

    // Calling again with the same tbaKey updates the existing row instead of duplicating.
    const renamedId = await asAdmin.mutation(api.events.setActive, {
      tbaKey: "2026second",
      name: "Renamed Event",
    });
    expect(renamedId).toBe(secondId);
    const renamed = await t.run((ctx) => ctx.db.get(secondId));
    expect(renamed?.name).toBe("Renamed Event");
  });
});

describe("teams.listWithStatus", () => {
  test("reports pitScouted/matchReportCount and personal/primary tiers", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const scoutedTeamId = await createTeam(t, eventId, 100);
    const unscoutedTeamId = await createTeam(t, eventId, 200);

    const scoutId = await createUser(t, "scout");
    const adminId = await createUser(t, "admin");

    await t.run(async (ctx) => {
      await ctx.db.insert("pitReports", {
        eventId,
        teamId: scoutedTeamId,
        scoutId,
        canScoreBalls: true,
        canClimb: false,
        driverRating: 3,
        defenseRating: 2,
        tags: [],
      });
      for (let i = 0; i < 2; i++) {
        await ctx.db.insert("matchReports", {
          eventId,
          teamId: scoutedTeamId,
          matchNumber: i + 1,
          scoutId,
          ballsScored: 5,
          ballsMissed: 1,
          maxStorage: 3,
          climbAttempted: false,
          climbSucceeded: false,
          playedDefense: false,
          tags: [],
        });
      }
      // Scout's personal picklist (ownerId set).
      await ctx.db.insert("picklists", {
        eventId,
        ownerId: scoutId,
        entries: [{ teamId: scoutedTeamId, tier: "S", rank: 0 }],
      });
      // Primary picklist (ownerId absent).
      await ctx.db.insert("picklists", {
        eventId,
        entries: [{ teamId: scoutedTeamId, tier: "A", rank: 0 }],
      });
    });

    const asScout = t.withIdentity({ subject: scoutId });
    const scoutView = await asScout.query(api.teams.listWithStatus, {});
    const scoutScouted = scoutView.find((team) => team._id === scoutedTeamId);
    const scoutUnscouted = scoutView.find((team) => team._id === unscoutedTeamId);

    expect(scoutScouted?.pitScouted).toBe(true);
    expect(scoutScouted?.matchReportCount).toBe(2);
    expect(scoutScouted?.personalTier).toBe("S");
    expect(scoutScouted?.primaryTier).toBeNull();

    expect(scoutUnscouted?.pitScouted).toBe(false);
    expect(scoutUnscouted?.matchReportCount).toBe(0);
    expect(scoutUnscouted?.personalTier).toBeNull();

    const asAdmin = t.withIdentity({ subject: adminId });
    const adminView = await asAdmin.query(api.teams.listWithStatus, {});
    const adminScouted = adminView.find((team) => team._id === scoutedTeamId);
    expect(adminScouted?.primaryTier).toBe("A");
    expect(adminScouted?.personalTier).toBeNull(); // admin has no personal picklist of their own
  });
});

describe("teams.remove", () => {
  test("cascades to pit reports, match reports, and picklist entries", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const otherTeamId = await createTeam(t, eventId, 200);
    const adminId = await createUser(t, "admin");
    const scoutId = await createUser(t, "scout");

    const { pitReportId, matchReportId, picklistId } = await t.run(async (ctx) => {
      const pitReportId = await ctx.db.insert("pitReports", {
        eventId,
        teamId,
        scoutId,
        canScoreBalls: true,
        canClimb: true,
        driverRating: 4,
        defenseRating: 4,
        tags: [],
      });
      const matchReportId = await ctx.db.insert("matchReports", {
        eventId,
        teamId,
        matchNumber: 1,
        scoutId,
        ballsScored: 1,
        ballsMissed: 1,
        maxStorage: 1,
        climbAttempted: true,
        climbSucceeded: true,
        playedDefense: true,
        tags: [],
      });
      const picklistId = await ctx.db.insert("picklists", {
        eventId,
        ownerId: scoutId,
        entries: [
          { teamId, tier: "S", rank: 0 },
          { teamId: otherTeamId, tier: "A", rank: 1 },
        ],
      });
      return { pitReportId, matchReportId, picklistId };
    });

    await t.withIdentity({ subject: adminId }).mutation(api.teams.remove, { teamId });

    expect(await t.run((ctx) => ctx.db.get(pitReportId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(matchReportId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(teamId))).toBeNull();
    const picklist = await t.run((ctx) => ctx.db.get(picklistId));
    expect(picklist?.entries).toEqual([{ teamId: otherTeamId, tier: "A", rank: 1 }]);
  });
});
