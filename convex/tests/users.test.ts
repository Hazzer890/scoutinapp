import { describe, expect, test } from "vitest";
import { setupTest } from "./setup.helpers";
import { api } from "../_generated/api";
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
