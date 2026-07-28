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
    red: { team_keys: string[] };
    blue: { team_keys: string[] };
  };
  time?: number | null;
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

export function mapTbaMatch(m: TbaMatchRaw): MatchImportRow {
  return {
    tbaKey: m.key,
    matchNumber: m.match_number,
    redTeams: m.alliances.red.team_keys.map((k) => parseInt(k.slice(3))),
    blueTeams: m.alliances.blue.team_keys.map((k) => parseInt(k.slice(3))),
    scheduledTime: m.time ? m.time * 1000 : undefined,
  };
}

// Only qualification matches are scouted; playoffs/finals are dropped on import.
export function mapQualMatches(matches: TbaMatchRaw[]): MatchImportRow[] {
  return matches.filter((m) => m.comp_level === "qm").map(mapTbaMatch);
}
