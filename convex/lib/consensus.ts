import type { Id } from "../_generated/dataModel";
import { TIERS, S_TIER_MAX, type Tier } from "./constants";

export type Entry = { teamId: Id<"teams">; tier: Tier; rank: number };
export type ConsensusResult = { teamId: Id<"teams">; score: number; tier: Tier; lists: number };

const TIER_VALUES: Record<Tier, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, DNP: 0 };

// TIERS is ordered highest value first, so the last tier found at the
// minimum distance is the lower one — matching "round half down" on ties.
function closestTier(score: number): Tier {
  let best: Tier = TIERS[0];
  let bestDist = Infinity;
  for (const tier of TIERS) {
    const dist = Math.abs(TIER_VALUES[tier] - score);
    if (dist <= bestDist) {
      bestDist = dist;
      best = tier;
    }
  }
  return best;
}

export function mergeLists(lists: Entry[][], allTeamIds: Id<"teams">[]): ConsensusResult[] {
  const validTeamIds = new Set(allTeamIds);
  const scoresByTeam = new Map<Id<"teams">, number[]>();
  const dnpCountByTeam = new Map<Id<"teams">, number>();

  for (const list of lists) {
    const validEntries = list.filter((entry) => validTeamIds.has(entry.teamId));
    const countInTier = new Map<Tier, number>();
    for (const entry of validEntries) {
      countInTier.set(entry.tier, (countInTier.get(entry.tier) ?? 0) + 1);
    }
    for (const entry of validEntries) {
      const count = countInTier.get(entry.tier)!;
      const score = TIER_VALUES[entry.tier] + 0.5 * (1 - entry.rank / count);
      const scores = scoresByTeam.get(entry.teamId);
      if (scores) scores.push(score);
      else scoresByTeam.set(entry.teamId, [score]);
      if (entry.tier === "DNP") {
        dnpCountByTeam.set(entry.teamId, (dnpCountByTeam.get(entry.teamId) ?? 0) + 1);
      }
    }
  }

  const results: ConsensusResult[] = [];
  for (const [teamId, scores] of scoresByTeam) {
    const dnpCount = dnpCountByTeam.get(teamId) ?? 0;
    const score = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const tier = dnpCount / scores.length > 0.5 ? "DNP" : closestTier(score);
    results.push({ teamId, score, tier, lists: scores.length });
  }

  results.sort((a, b) => b.score - a.score);

  // S overflow beyond S_TIER_MAX demotes to top of A; demoted teams keep
  // their score, so they sort ahead of every genuine A-tier team.
  let sCount = 0;
  for (const result of results) {
    if (result.tier === "S") {
      sCount++;
      if (sCount > S_TIER_MAX) result.tier = "A";
    }
  }

  return results;
}
