import { TELEOP_SECONDS } from "./constants";

export type MatchReportLike = {
  ballsScored: number;
  ballsMissed: number;
  maxStorage: number;
  climbAttempted: boolean;
  climbSucceeded: boolean;
};

export type TeamStats = {
  matchCount: number;
  avgBalls: number;
  accuracy: number | null;
  throughputBps: number;
  throughputPctOfBenchmark: number | null;
  avgStorage: number;
  climbSuccessRate: number | null;
};

export function computeTeamStats(reports: MatchReportLike[]): TeamStats {
  const matchCount = reports.length;
  const totalScored = reports.reduce((sum, r) => sum + r.ballsScored, 0);
  const totalMissed = reports.reduce((sum, r) => sum + r.ballsMissed, 0);
  const totalStorage = reports.reduce((sum, r) => sum + r.maxStorage, 0);
  const attempts = reports.filter((r) => r.climbAttempted);
  const successes = attempts.filter((r) => r.climbSucceeded);

  const avgBalls = matchCount === 0 ? 0 : totalScored / matchCount;

  return {
    matchCount,
    avgBalls,
    accuracy: totalScored + totalMissed === 0 ? null : totalScored / (totalScored + totalMissed),
    throughputBps: avgBalls / TELEOP_SECONDS,
    throughputPctOfBenchmark: null,
    avgStorage: matchCount === 0 ? 0 : totalStorage / matchCount,
    climbSuccessRate: attempts.length === 0 ? null : successes.length / attempts.length,
  };
}

export function benchmarkPct(teamBps: number, benchmarkBps: number | null): number | null {
  if (benchmarkBps === null || benchmarkBps === 0) return null;
  return (teamBps / benchmarkBps) * 100;
}
