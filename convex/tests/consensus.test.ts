import { describe, expect, test } from "vitest";
import { mergeLists, type Entry } from "../lib/consensus";
import type { Id } from "../_generated/dataModel";

function teamId(n: string): Id<"teams"> {
  return n as Id<"teams">;
}

const T1 = teamId("t1");
const T2 = teamId("t2");
const T3 = teamId("t3");

function entry(teamId: Id<"teams">, tier: Entry["tier"], rank: number): Entry {
  return { teamId, tier, rank };
}

describe("mergeLists", () => {
  test("consensus score is the mean of per-list scores", () => {
    // list1: T1 alone in S -> 6 + 0.5*(1-0/1) = 6.5
    // list2: T1 alone in A -> 5 + 0.5*(1-0/1) = 5.5
    // mean = 6
    const results = mergeLists([[entry(T1, "S", 0)], [entry(T1, "A", 0)]], [T1]);
    expect(results).toHaveLength(1);
    expect(results[0].teamId).toBe(T1);
    expect(results[0].score).toBeCloseTo(6);
    expect(results[0].lists).toBe(2);
  });

  test("position bonus orders teams within the same tier by rank", () => {
    // Both in tier A, count=2. rank 0 -> 5.5, rank 1 -> 5.25.
    const results = mergeLists([[entry(T1, "A", 0), entry(T2, "A", 1)]], [T1, T2]);
    expect(results.map((r) => r.teamId)).toEqual([T1, T2]);
    expect(results[0].score).toBeCloseTo(5.5);
    expect(results[1].score).toBeCloseTo(5.25);
  });

  test("DNP tier wins when a majority of categorizing lists marked it DNP", () => {
    const results = mergeLists(
      [[entry(T1, "DNP", 0)], [entry(T1, "DNP", 0)], [entry(T1, "B", 0)]],
      [T1],
    );
    expect(results[0].tier).toBe("DNP");
  });

  test("DNP minority does not force the DNP tier", () => {
    const results = mergeLists(
      [[entry(T1, "DNP", 0)], [entry(T1, "B", 0)], [entry(T1, "B", 0)]],
      [T1],
    );
    expect(results[0].tier).not.toBe("DNP");
  });

  test("S overflow beyond S_TIER_MAX demotes to top of A", () => {
    // Three teams, each alone in S in their own list -> identical score, tier S.
    const results = mergeLists(
      [[entry(T1, "S", 0)], [entry(T2, "S", 0)], [entry(T3, "S", 0)]],
      [T1, T2, T3],
    );
    expect(results.filter((r) => r.tier === "S")).toHaveLength(2);
    const demoted = results.filter((r) => r.tier === "A");
    expect(demoted).toHaveLength(1);
    expect(demoted[0].teamId).toBe(T3);
  });

  test("teams categorized by no list are excluded", () => {
    const results = mergeLists([[entry(T1, "B", 0)]], [T1, T2]);
    expect(results.map((r) => r.teamId)).toEqual([T1]);
  });
});
