// Pure response -> row mappers for TBA import, kept dependency-free so they're
// unit-testable without hitting the network or a Convex runtime.

export interface TbaTeamRaw {
  key: string;
  team_number: number;
  nickname?: string | null;
  city?: string | null;
  state_prov?: string | null;
  country?: string | null;
}

export interface TbaMatchRaw {
  key: string;
  comp_level: string;
  match_number: number;
  alliances: {
    // TBA reports score -1 for a match that hasn't been played yet.
    red: { team_keys: string[]; score?: number | null };
    blue: { team_keys: string[]; score?: number | null };
  };
  time?: number | null;
  predicted_time?: number | null;
  actual_time?: number | null;
}

export interface TeamImportRow {
  tbaKey: string;
  number: number;
  nickname: string;
  city?: string;
  stateProv?: string;
  country?: string;
}

export interface MatchImportRow {
  tbaKey: string;
  matchNumber: number;
  redTeams: number[];
  blueTeams: number[];
  scheduledTime?: number;
  predictedTime?: number;
  actualTime?: number;
  redScore?: number;
  blueScore?: number;
}

export function mapTbaTeam(t: TbaTeamRaw): TeamImportRow {
  return {
    tbaKey: t.key,
    number: t.team_number,
    nickname: t.nickname ?? String(t.team_number),
    city: t.city ?? undefined,
    stateProv: t.state_prov ?? undefined,
    country: t.country ?? undefined,
  };
}

// TBA timestamps are seconds since epoch; the app stores milliseconds.
function toMs(seconds: number | null | undefined): number | undefined {
  return seconds ? seconds * 1000 : undefined;
}

// A missing/negative score means TBA has no result for the match yet.
function toScore(score: number | null | undefined): number | undefined {
  return typeof score === "number" && score >= 0 ? score : undefined;
}

export function mapTbaMatch(m: TbaMatchRaw): MatchImportRow {
  const redScore = toScore(m.alliances.red.score);
  const blueScore = toScore(m.alliances.blue.score);
  return {
    tbaKey: m.key,
    matchNumber: m.match_number,
    redTeams: m.alliances.red.team_keys.map((k) => parseInt(k.slice(3))),
    blueTeams: m.alliances.blue.team_keys.map((k) => parseInt(k.slice(3))),
    scheduledTime: toMs(m.time),
    predictedTime: toMs(m.predicted_time),
    actualTime: toMs(m.actual_time),
    // Both scores or neither, so `redScore !== undefined` is a reliable
    // "this match has been played" test everywhere downstream.
    ...(redScore !== undefined && blueScore !== undefined ? { redScore, blueScore } : {}),
  };
}

// Only qualification matches are scouted; playoffs/finals are dropped on import.
export function mapQualMatches(matches: TbaMatchRaw[]): MatchImportRow[] {
  return matches.filter((m) => m.comp_level === "qm").map(mapTbaMatch);
}

// A match is upcoming until TBA posts a score for it.
export function isUpcoming(m: { redScore?: number }): boolean {
  return m.redScore === undefined;
}

// Best available estimate of when a match runs: TBA's rolling prediction beats
// the published schedule once an event drifts, and actual time wins outright.
export function matchTime(m: {
  actualTime?: number;
  predictedTime?: number;
  scheduledTime?: number;
}): number | undefined {
  return m.actualTime ?? m.predictedTime ?? m.scheduledTime;
}

// Play order: by best-known time, falling back to match number when an event
// has no times at all (hand-entered schedules) or two matches share one.
export function compareByPlayOrder<T extends { matchNumber: number; actualTime?: number; predictedTime?: number; scheduledTime?: number }>(
  a: T,
  b: T,
): number {
  const ta = matchTime(a);
  const tb = matchTime(b);
  if (ta !== undefined && tb !== undefined && ta !== tb) return ta - tb;
  return a.matchNumber - b.matchNumber;
}
