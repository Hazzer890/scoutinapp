import { describe, expect, test } from "vitest";
import { setupTest } from "./setup.helpers";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { bootstrapRole } from "../auth";
import { MAX_COMMENT_LENGTH } from "../lib/constants";

type Test = ReturnType<typeof setupTest>;

async function createUser(t: Test, role: "admin" | "scout", name?: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
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

describe("comments.add", () => {
  test("stores a comment without requiring a pit report", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scout = await createUser(t, "scout", "Ada");

    await t
      .withIdentity({ subject: scout })
      .mutation(api.comments.add, { teamId, text: "  Broke a chain in quals  " });

    const comments = await t
      .withIdentity({ subject: scout })
      .query(api.comments.listForTeam, { teamId });
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe("Broke a chain in quals");
    expect(comments[0].authorName).toBe("Ada");

    const reports = await t.run((ctx) => ctx.db.query("pitReports").collect());
    expect(reports).toHaveLength(0);
  });

  test("inherits the team's event so counts stay scoped to it", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scout = await createUser(t, "scout");

    await t.withIdentity({ subject: scout }).mutation(api.comments.add, { teamId, text: "Fast" });

    const stored = await t.run((ctx) => ctx.db.query("teamComments").collect());
    expect(stored[0].eventId).toBe(eventId);
  });

  test("rejects blank and over-long comments", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scout = await createUser(t, "scout");
    const as = t.withIdentity({ subject: scout });

    await expect(as.mutation(api.comments.add, { teamId, text: "   " })).rejects.toThrow();
    await expect(
      as.mutation(api.comments.add, { teamId, text: "x".repeat(MAX_COMMENT_LENGTH + 1) }),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("teamComments").collect())).toHaveLength(0);
  });

  test("requires sign-in", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);

    await expect(t.mutation(api.comments.add, { teamId, text: "Anon" })).rejects.toThrow();
  });
});

describe("comments.listForTeam", () => {
  test("returns newest first and only flags comments the caller may delete", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const author = await createUser(t, "scout", "Ada");
    const other = await createUser(t, "scout", "Grace");
    const admin = await createUser(t, "admin", "Root");

    await t.withIdentity({ subject: author }).mutation(api.comments.add, { teamId, text: "first" });
    await t.withIdentity({ subject: other }).mutation(api.comments.add, { teamId, text: "second" });

    const asAuthor = await t
      .withIdentity({ subject: author })
      .query(api.comments.listForTeam, { teamId });
    expect(asAuthor.map((c) => c.text)).toEqual(["second", "first"]);
    expect(asAuthor.map((c) => c.canDelete)).toEqual([false, true]);

    const asAdmin = await t
      .withIdentity({ subject: admin })
      .query(api.comments.listForTeam, { teamId });
    expect(asAdmin.every((c) => c.canDelete)).toBe(true);
  });

  test("does not leak comments from another team", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const otherTeamId = await createTeam(t, eventId, 200);
    const scout = await createUser(t, "scout");

    await t.withIdentity({ subject: scout }).mutation(api.comments.add, { teamId, text: "mine" });

    const comments = await t
      .withIdentity({ subject: scout })
      .query(api.comments.listForTeam, { teamId: otherTeamId });
    expect(comments).toEqual([]);
  });
});

describe("comments.remove", () => {
  test("author and admin can delete; other scouts cannot", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const author = await createUser(t, "scout");
    const other = await createUser(t, "scout");
    const admin = await createUser(t, "admin");

    const commentId = await t
      .withIdentity({ subject: author })
      .mutation(api.comments.add, { teamId, text: "mine" });

    await expect(
      t.withIdentity({ subject: other }).mutation(api.comments.remove, { commentId }),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("teamComments").collect())).toHaveLength(1);

    await t.withIdentity({ subject: author }).mutation(api.comments.remove, { commentId });
    expect(await t.run((ctx) => ctx.db.query("teamComments").collect())).toHaveLength(0);

    const adminTarget = await t
      .withIdentity({ subject: author })
      .mutation(api.comments.add, { teamId, text: "moderate me" });
    await t.withIdentity({ subject: admin }).mutation(api.comments.remove, { commentId: adminTarget });
    expect(await t.run((ctx) => ctx.db.query("teamComments").collect())).toHaveLength(0);
  });
});

describe("teams with comments", () => {
  test("listWithStatus counts comments without marking the team scouted", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scout = await createUser(t, "scout");

    await t.withIdentity({ subject: scout }).mutation(api.comments.add, { teamId, text: "one" });
    await t.withIdentity({ subject: scout }).mutation(api.comments.add, { teamId, text: "two" });

    const teams = await t.withIdentity({ subject: scout }).query(api.teams.listWithStatus, {});
    expect(teams[0].commentCount).toBe(2);
    expect(teams[0].scoutCount).toBe(0);
    expect(teams[0].scoutedByMe).toBe(false);
  });

  test("deleting a team removes its comments", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scout = await createUser(t, "scout");
    const admin = await createUser(t, "admin");

    await t.withIdentity({ subject: scout }).mutation(api.comments.add, { teamId, text: "bye" });
    await t.withIdentity({ subject: admin }).mutation(api.teams.remove, { teamId });

    expect(await t.run((ctx) => ctx.db.query("teamComments").collect())).toHaveLength(0);
  });
});
