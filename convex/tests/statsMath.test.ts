import { describe, expect, test } from "vitest";
import { computeTeamStats, benchmarkPct, type MatchReportLike } from "../lib/statsMath";
import { TELEOP_SECONDS } from "../lib/constants";

function report(overrides: Partial<MatchReportLike> = {}): MatchReportLike {
  return {
    ballsScored: 0,
    ballsMissed: 0,
    maxStorage: 0,
    climbAttempted: false,
    climbSucceeded: false,
    ...overrides,
  };
}

describe("computeTeamStats", () => {
  test("no reports yields zeros and nulls", () => {
    const stats = computeTeamStats([]);
    expect(stats).toEqual({
      matchCount: 0,
      avgBalls: 0,
      accuracy: null,
      throughputBps: 0,
      throughputPctOfBenchmark: null,
      avgStorage: 0,
      climbSuccessRate: null,
    });
  });

  test("accuracy is scored/(scored+missed) across reports", () => {
    const stats = computeTeamStats([
      report({ ballsScored: 8, ballsMissed: 2 }),
      report({ ballsScored: 2, ballsMissed: 8 }),
    ]);
    // totals: 10 scored, 10 missed
    expect(stats.accuracy).toBe(0.5);
  });

  test("accuracy is null when scored and missed are both zero", () => {
    const stats = computeTeamStats([report({ ballsScored: 0, ballsMissed: 0 })]);
    expect(stats.accuracy).toBeNull();
  });

  test("throughputBps is avgBalls / TELEOP_SECONDS", () => {
    const stats = computeTeamStats([
      report({ ballsScored: 10 }),
      report({ ballsScored: 20 }),
    ]);
    expect(stats.avgBalls).toBe(15);
    expect(stats.throughputBps).toBeCloseTo(15 / TELEOP_SECONDS);
  });

  test("avgStorage averages maxStorage across reports", () => {
    const stats = computeTeamStats([report({ maxStorage: 2 }), report({ maxStorage: 4 })]);
    expect(stats.avgStorage).toBe(3);
  });

  test("climbSuccessRate counts only attempted climbs", () => {
    const stats = computeTeamStats([
      report({ climbAttempted: true, climbSucceeded: true }),
      report({ climbAttempted: true, climbSucceeded: false }),
      report({ climbAttempted: false, climbSucceeded: false }),
    ]);
    expect(stats.climbSuccessRate).toBe(0.5);
  });

  test("climbSuccessRate is null when no climbs were attempted", () => {
    const stats = computeTeamStats([report({ climbAttempted: false })]);
    expect(stats.climbSuccessRate).toBeNull();
  });
});

describe("benchmarkPct", () => {
  test("computes teamBps as a percentage of benchmarkBps", () => {
    expect(benchmarkPct(5, 10)).toBe(50);
  });

  test("is null when the benchmark team has no reports", () => {
    expect(benchmarkPct(5, null)).toBeNull();
  });

  test("is null when benchmarkBps is zero (avoid division by zero)", () => {
    expect(benchmarkPct(5, 0)).toBeNull();
  });
});
