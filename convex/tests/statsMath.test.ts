import { describe, expect, test } from "vitest";
import { benchmarkPct } from "../lib/statsMath";

describe("benchmarkPct", () => {
  test("computes team balls as a percentage of the benchmark's", () => {
    expect(benchmarkPct(5, 10)).toBe(50);
  });

  test("is null when the benchmark team has no estimate", () => {
    expect(benchmarkPct(5, null)).toBeNull();
  });

  test("is null when the benchmark estimate is zero (avoid division by zero)", () => {
    expect(benchmarkPct(5, 0)).toBeNull();
  });
});
