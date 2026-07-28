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

describe("picklists auth", () => {
  test("read and write functions reject unauthenticated callers", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);

    await expect(t.query(api.picklists.getMine, {})).rejects.toThrow("Not signed in");
    await expect(
      t.mutation(api.picklists.moveEntry, { scope: "mine", teamId, tier: "A", rank: 0 }),
    ).rejects.toThrow("Not signed in");
  });

  test("admin-only functions reject scouts", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scoutId = await createUser(t, "scout");
    const asScout = t.withIdentity({ subject: scoutId });

    await expect(asScout.query(api.picklists.getPrimary, {})).rejects.toThrow("Admin only");
    await expect(asScout.query(api.picklists.listAll, {})).rejects.toThrow("Admin only");
    await expect(asScout.query(api.picklists.mergePreview, {})).rejects.toThrow("Admin only");
    await expect(asScout.mutation(api.picklists.applyMerge, {})).rejects.toThrow("Admin only");
    await expect(
      asScout.mutation(api.picklists.moveEntry, { scope: "primary", teamId, tier: "A", rank: 0 }),
    ).rejects.toThrow("Admin only");
  });
});

describe("picklists.moveEntry", () => {
  test("throws when inserting into a full S tier, but allows moving within S", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamA = await createTeam(t, eventId, 1);
    const teamB = await createTeam(t, eventId, 2);
    const teamC = await createTeam(t, eventId, 3);
    const scoutId = await createUser(t, "scout");
    const asScout = t.withIdentity({ subject: scoutId });

    await asScout.mutation(api.picklists.moveEntry, {
      scope: "mine",
      teamId: teamA,
      tier: "S",
      rank: 0,
    });
    await asScout.mutation(api.picklists.moveEntry, {
      scope: "mine",
      teamId: teamB,
      tier: "S",
      rank: 1,
    });

    await expect(
      asScout.mutation(api.picklists.moveEntry, {
        scope: "mine",
        teamId: teamC,
        tier: "S",
        rank: 0,
      }),
    ).rejects.toThrow("S tier is full");

    // Moving an existing S entry to a different rank within S is allowed.
    await asScout.mutation(api.picklists.moveEntry, {
      scope: "mine",
      teamId: teamB,
      tier: "S",
      rank: 0,
    });
    const mine = await asScout.query(api.picklists.getMine, {});
    expect(mine.entries).toEqual([
      { teamId: teamB, tier: "S", rank: 0 },
      { teamId: teamA, tier: "S", rank: 1 },
    ]);
  });

  test("renumbers ranks contiguously in both tiers after a cross-tier move", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teams = await Promise.all([1, 2, 3].map((n) => createTeam(t, eventId, n)));
    const scoutId = await createUser(t, "scout");
    const asScout = t.withIdentity({ subject: scoutId });

    // All three land in tier B, ranks 0, 1, 2.
    for (const teamId of teams) {
      await asScout.mutation(api.picklists.moveEntry, {
        scope: "mine",
        teamId,
        tier: "B",
        rank: 999, // clamps to append at the end
      });
    }

    // Move the middle team out to tier A.
    await asScout.mutation(api.picklists.moveEntry, {
      scope: "mine",
      teamId: teams[1],
      tier: "A",
      rank: 0,
    });

    const mine = await asScout.query(api.picklists.getMine, {});
    const bEntries = mine.entries.filter((e) => e.tier === "B").sort((a, b) => a.rank - b.rank);
    const aEntries = mine.entries.filter((e) => e.tier === "A");

    expect(bEntries.map((e) => e.rank)).toEqual([0, 1]);
    expect(bEntries.map((e) => e.teamId)).toEqual([teams[0], teams[2]]);
    expect(aEntries).toEqual([{ teamId: teams[1], tier: "A", rank: 0 }]);
  });

  test("tier: null removes the team to Uncategorized", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 1);
    const scoutId = await createUser(t, "scout");
    const asScout = t.withIdentity({ subject: scoutId });

    await asScout.mutation(api.picklists.moveEntry, { scope: "mine", teamId, tier: "B", rank: 0 });
    await asScout.mutation(api.picklists.moveEntry, { scope: "mine", teamId, tier: null, rank: 0 });

    const mine = await asScout.query(api.picklists.getMine, {});
    expect(mine.entries).toEqual([]);
  });
});

describe("picklists.listAll", () => {
  test("returns every scout's personal list with resolved names, excluding the primary list", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 1);
    const scoutId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "Scout One" });
      await bootstrapRole(ctx, { userId, existingUserId: null });
      await ctx.db.patch(userId, { role: "scout" });
      return userId;
    });
    const adminId = await createUser(t, "admin");
    const asScout = t.withIdentity({ subject: scoutId });
    const asAdmin = t.withIdentity({ subject: adminId });

    await asScout.mutation(api.picklists.moveEntry, { scope: "mine", teamId, tier: "A", rank: 0 });
    await asAdmin.mutation(api.picklists.applyMerge, {}); // writes the primary list

    const all = await asAdmin.query(api.picklists.listAll, {});
    expect(all).toEqual([
      { scoutId, scoutName: "Scout One", entries: [{ teamId, tier: "A", rank: 0 }] },
    ]);
  });
});

describe("picklists.applyMerge", () => {
  test("overwrites the existing primary list rather than merging into it", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamOld = await createTeam(t, eventId, 1);
    const teamNew = await createTeam(t, eventId, 2);
    const scoutId = await createUser(t, "scout");
    const adminId = await createUser(t, "admin");
    const asScout = t.withIdentity({ subject: scoutId });
    const asAdmin = t.withIdentity({ subject: adminId });

    await t.run((ctx) =>
      ctx.db.insert("picklists", {
        eventId,
        entries: [{ teamId: teamOld, tier: "S", rank: 0 }],
      }),
    );

    // teamNew alone at rank 0 of B scores exactly the B/A tie boundary
    // (4 + 0.5); "round half down" keeps ties in the lower tier, so it
    // merges as B, not A.
    await asScout.mutation(api.picklists.moveEntry, {
      scope: "mine",
      teamId: teamNew,
      tier: "B",
      rank: 0,
    });

    await asAdmin.mutation(api.picklists.applyMerge, {});

    const primary = await asAdmin.query(api.picklists.getPrimary, {});
    expect(primary.entries).toEqual([{ teamId: teamNew, tier: "B", rank: 0 }]);
  });
});
