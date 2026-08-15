import { expect, test } from "vitest";
import { setupTest } from "./setup.helpers";
import { api } from "../_generated/api";

// Regression: after a TBA sync sets matchesSyncedAt, getActive's returns
// validator must still accept the event doc.
test("getActive returns a synced event", async () => {
  const t = setupTest();
  await t.run(async (ctx) => {
    await ctx.db.insert("events", {
      tbaKey: "2026test",
      name: "Test Event",
      isActive: true,
      matchesSyncedAt: Date.now(),
    });
  });
  const event = await t.query(api.events.getActive, {});
  expect(event?.tbaKey).toBe("2026test");
});
