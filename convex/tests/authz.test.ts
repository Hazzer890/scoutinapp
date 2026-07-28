import { describe, expect, test } from "vitest";
import { setupTest } from "./setup.helpers";
import { bootstrapRole } from "../auth";
import { requireAdmin } from "../model/authz";

describe("role bootstrap", () => {
  test("first user becomes admin, later users become scouts", async () => {
    const t = setupTest();

    const firstUserId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      await bootstrapRole(ctx, { userId, existingUserId: null });
      return userId;
    });
    const secondUserId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      await bootstrapRole(ctx, { userId, existingUserId: null });
      return userId;
    });

    const firstUser = await t.run((ctx) => ctx.db.get(firstUserId));
    const secondUser = await t.run((ctx) => ctx.db.get(secondUserId));
    expect(firstUser?.role).toBe("admin");
    expect(secondUser?.role).toBe("scout");
  });
});

describe("requireAdmin", () => {
  test("throws for a scout identity", async () => {
    const t = setupTest();

    const scoutId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      await bootstrapRole(ctx, { userId, existingUserId: null });
      await ctx.db.patch(userId, { role: "scout" });
      return userId;
    });

    await expect(
      t.withIdentity({ subject: scoutId }).run((ctx) => requireAdmin(ctx)),
    ).rejects.toThrow("Admin only");
  });
});
