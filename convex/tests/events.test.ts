import { describe, expect, test } from "vitest";
import { setupTest } from "./setup.helpers";
import { api } from "../_generated/api";

describe("events.getActive", () => {
  test("returns the active event", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("events", { tbaKey: "2026old", name: "Old Event", isActive: false });
      await ctx.db.insert("events", { tbaKey: "2026test", name: "Test Event", isActive: true });
    });

    const event = await t.query(api.events.getActive, {});
    expect(event?.tbaKey).toBe("2026test");
  });

  test("returns null when no event is active", async () => {
    const t = setupTest();
    expect(await t.query(api.events.getActive, {})).toBeNull();
  });

  // Regression: the return validator omitted `matchesSyncedAt`, so every read of an
  // event that had been through a TBA match sync failed server-side.
  test("returns an event that has been match-synced", async () => {
    const t = setupTest();
    await t.run((ctx) =>
      ctx.db.insert("events", {
        tbaKey: "2026test",
        name: "Test Event",
        isActive: true,
        matchesSyncedAt: 1700000000000,
      }),
    );

    const event = await t.query(api.events.getActive, {});
    expect(event?.matchesSyncedAt).toBe(1700000000000);
  });
});
