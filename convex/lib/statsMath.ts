export function benchmarkPct(teamBalls: number, benchmarkBalls: number | null): number | null {
  if (benchmarkBalls === null || benchmarkBalls === 0) return null;
  return (teamBalls / benchmarkBalls) * 100;
}
