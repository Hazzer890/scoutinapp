import { v } from "convex/values";

export const BENCHMARK_TEAM = 4788;

export const TIERS = ["S", "A", "B", "C", "D", "DNP"] as const;
export type Tier = (typeof TIERS)[number];
export const tierValidator = v.union(...TIERS.map((tier) => v.literal(tier)));

export const S_TIER_MAX = 2;

export const PRESET_TAGS = [
  "Fast",
  "Good driver",
  "Plays defense",
  "Tippy",
  "Broke down",
  "Inconsistent",
];
