import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { aggregatePitReports } from "../lib/pitAggregate";

let nextId = 0;
function report(overrides: Partial<Doc<"pitReports">>): Doc<"pitReports"> {
  nextId++;
  return {
    _id: `report${nextId}` as Id<"pitReports">,
    _creationTime: nextId,
    eventId: "event1" as Id<"events">,
    teamId: "team1" as Id<"teams">,
    scoutId: `scout${nextId}` as Id<"users">,
    canScoreBalls: false,
    canClimb: false,
    driverRating: 3,
    defenseRating: 3,
    tags: [],
    ...overrides,
  };
}

describe("aggregatePitReports", () => {
  test("returns null for no reports", () => {
    expect(aggregatePitReports([])).toBeNull();
  });

  test("averages numbers, counts booleans, takes mode of enums", () => {
    const agg = aggregatePitReports([
      report({
        canScoreBalls: true,
        canClimb: true,
        ballsPerMatch: 4,
        storageCapacity: 2,
        driverRating: 5,
        defenseRating: 2,
        hasAuto: true,
        autoSide: "left",
        autoDepth: "close",
        autoBalls: 2,
        autoClimb: true,
      }),
      report({
        canScoreBalls: true,
        canClimb: false,
        ballsPerMatch: 5,
        driverRating: 2,
        defenseRating: 3,
        hasAuto: true,
        autoSide: "left",
        autoDepth: "middle",
        autoBalls: 1,
        autoClimb: false,
      }),
      report({ canScoreBalls: false, canClimb: false, driverRating: 4, defenseRating: 4 }),
    ]);

    expect(agg).not.toBeNull();
    expect(agg!.scoutCount).toBe(3);
    expect(agg!.canScoreBalls).toEqual({ yes: 2, total: 3 });
    expect(agg!.canClimb).toEqual({ yes: 1, total: 3 });
    expect(agg!.hasAuto).toEqual({ yes: 2, total: 3 });
    expect(agg!.autoClimb).toEqual({ yes: 1, total: 2 });
    expect(agg!.ballsPerMatch).toBe(4.5); // mean of 4, 5 — third report didn't set it
    expect(agg!.storageCapacity).toBe(2); // only one report set it
    expect(agg!.autoBalls).toBe(1.5);
    expect(agg!.driverRating).toBeCloseTo(3.7); // mean of 5, 2, 4 = 3.666… → 3.7
    expect(agg!.defenseRating).toBe(3);
    expect(agg!.autoSide).toEqual({ value: "left", count: 2 });
    expect(agg!.autoDepth).toEqual({ value: "close", count: 1 }); // tie broken by option order
  });

  test("unions tags with counts and collects notes and latest photo", () => {
    const agg = aggregatePitReports([
      report({
        scoutId: "scoutA" as Id<"users">,
        tags: ["Fast", "Tippy"],
        notes: "note A",
        photoId: "photoOld" as Id<"_storage">,
        _creationTime: 1,
      }),
      report({
        scoutId: "scoutB" as Id<"users">,
        tags: ["Fast"],
        photoId: "photoNew" as Id<"_storage">,
        _creationTime: 2,
      }),
      report({ scoutId: "scoutC" as Id<"users">, notes: "note C", _creationTime: 3 }),
    ]);

    expect(agg!.tags).toEqual([
      { tag: "Fast", count: 2 },
      { tag: "Tippy", count: 1 },
    ]);
    expect(agg!.notes).toEqual([
      { scoutId: "scoutA", note: "note A" },
      { scoutId: "scoutC", note: "note C" },
    ]);
    expect(agg!.photoId).toBe("photoNew");
  });
});
