import { describe, expect, test } from "vitest";
import { setupTest } from "./setup.helpers";
import { api } from "../_generated/api";
import { bootstrapRole, rejectBannedEmail } from "../auth";

type Test = ReturnType<typeof setupTest>;

async function createUser(t: Test, role: "admin" | "scout") {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    await bootstrapRole(ctx, { userId, existingUserId: null });
    await ctx.db.patch(userId, { role });
    return userId;
  });
}

describe("users.list", () => {
  test("rejects non-admins", async () => {
    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    await expect(
      t.withIdentity({ subject: scoutId }).query(api.users.list, {}),
    ).rejects.toThrow("Admin only");
  });

  test("returns all users for admins", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const scoutId = await createUser(t, "scout");

    const users = await t.withIdentity({ subject: adminId }).query(api.users.list, {});
    const ids = users.map((u) => u._id);
    expect(ids).toContain(adminId);
    expect(ids).toContain(scoutId);
    expect(users.find((u) => u._id === scoutId)?.role).toBe("scout");
  });
});

describe("users.setRole", () => {
  test("rejects non-admins", async () => {
    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    await expect(
      t
        .withIdentity({ subject: scoutId })
        .mutation(api.users.setRole, { userId: scoutId, role: "admin" }),
    ).rejects.toThrow("Admin only");
  });

  test("blocks demoting the last admin", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");

    await expect(
      t
        .withIdentity({ subject: adminId })
        .mutation(api.users.setRole, { userId: adminId, role: "scout" }),
    ).rejects.toThrow("Cannot demote the last admin");

    const user = await t.run((ctx) => ctx.db.get(adminId));
    expect(user?.role).toBe("admin");
  });

  test("allows demoting an admin when another admin remains", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const secondAdminId = await createUser(t, "admin");

    const result = await t
      .withIdentity({ subject: adminId })
      .mutation(api.users.setRole, { userId: secondAdminId, role: "scout" });
    expect(result).toBeNull();

    const user = await t.run((ctx) => ctx.db.get(secondAdminId));
    expect(user?.role).toBe("scout");
  });

  test("promotes a scout to admin", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const scoutId = await createUser(t, "scout");

    await t.withIdentity({ subject: adminId }).mutation(api.users.setRole, {
      userId: scoutId,
      role: "admin",
    });

    const user = await t.run((ctx) => ctx.db.get(scoutId));
    expect(user?.role).toBe("admin");
  });
});

describe("users.remove", () => {
  test("deletes the user with their auth/personal rows and bans the email", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const scoutId = await createUser(t, "scout");

    const sessionId = await t.run(async (ctx) => {
      await ctx.db.patch(scoutId, { email: "gone@example.com" });
      const eventId = await ctx.db.insert("events", {
        tbaKey: "2026test",
        name: "Test",
        isActive: true,
      });
      const teamId = await ctx.db.insert("teams", { eventId, number: 1, nickname: "One" });
      await ctx.db.insert("authAccounts", {
        userId: scoutId,
        provider: "password",
        providerAccountId: "gone@example.com",
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: scoutId,
        expirationTime: Date.now() + 1000000,
      });
      await ctx.db.insert("authRefreshTokens", {
        sessionId,
        expirationTime: Date.now() + 1000000,
      });
      await ctx.db.insert("watchlist", { eventId, teamId, userId: scoutId });
      await ctx.db.insert("picklists", { eventId, ownerId: scoutId, entries: [] });
      return sessionId;
    });

    await t.withIdentity({ subject: adminId }).mutation(api.users.remove, { userId: scoutId });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(scoutId)).toBeNull();
      expect(await ctx.db.get(sessionId)).toBeNull();
      expect(await ctx.db.query("authAccounts").collect()).toHaveLength(0);
      expect(await ctx.db.query("authRefreshTokens").collect()).toHaveLength(0);
      expect(await ctx.db.query("watchlist").collect()).toHaveLength(0);
      expect(await ctx.db.query("picklists").collect()).toHaveLength(0);
      const banned = await ctx.db
        .query("bannedEmails")
        .withIndex("by_email", (q) => q.eq("email", "gone@example.com"))
        .first();
      expect(banned).not.toBeNull();
    });
  });

  test("rejects self-deletion and non-admins", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const scoutId = await createUser(t, "scout");

    await expect(
      t.withIdentity({ subject: adminId }).mutation(api.users.remove, { userId: adminId }),
    ).rejects.toThrow("You cannot delete yourself");
    await expect(
      t.withIdentity({ subject: scoutId }).mutation(api.users.remove, { userId: adminId }),
    ).rejects.toThrow("Admin only");
  });

  test("banned email is rejected on sign-up", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("bannedEmails", { email: "gone@example.com" });
      const userId = await ctx.db.insert("users", { email: "gone@example.com" });
      await expect(rejectBannedEmail(ctx, userId)).rejects.toThrow("banned");
      const okId = await ctx.db.insert("users", { email: "fine@example.com" });
      await expect(rejectBannedEmail(ctx, okId)).resolves.toBeUndefined();
    });
  });
});

describe("users.setName", () => {
  test("admin renames a user; input is trimmed", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const scoutId = await createUser(t, "scout");

    await t.withIdentity({ subject: adminId }).mutation(api.users.setName, {
      userId: scoutId,
      name: "  Alice  ",
    });

    const scout = await t.run((ctx) => ctx.db.get(scoutId));
    expect(scout?.name).toBe("Alice");
  });

  test("rejects scouts and empty names", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const scoutId = await createUser(t, "scout");

    await expect(
      t.withIdentity({ subject: scoutId }).mutation(api.users.setName, {
        userId: adminId,
        name: "Hacker",
      }),
    ).rejects.toThrow("Admin only");

    await expect(
      t.withIdentity({ subject: adminId }).mutation(api.users.setName, {
        userId: scoutId,
        name: "   ",
      }),
    ).rejects.toThrow("Name cannot be empty");
  });
});
