import type { Doc, Id } from "../_generated/dataModel";

export type BoolCount = { yes: number; total: number };
export type PitAggregate = {
  scoutCount: number;
  canScoreBalls: BoolCount;
  canClimb: BoolCount;
  hasAuto: BoolCount;
  autoClimb: BoolCount; // total = reports with hasAuto === true
  storageCapacity: number | null; // means, 1 decimal place, null when no report sets the field
  ballsPerMatch: number | null;
  autoBalls: number | null;
  driverRating: number | null;
  defenseRating: number | null;
  autoSide: { value: "left" | "middle" | "right"; count: number } | null; // mode among hasAuto reports
  autoDepth: { value: "close" | "middle"; count: number } | null;
  tags: { tag: string; count: number }[]; // count desc, then alphabetical
  notes: { scoutId: Id<"users">; note: string }[]; // report creation order
  photoId: Id<"_storage"> | null; // from the most recent report with a photo
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const m = values.reduce((sum, x) => sum + x, 0) / values.length;
  return Math.round(m * 10) / 10;
}

function defined<T>(values: (T | undefined)[]): T[] {
  return values.filter((x): x is T => x !== undefined);
}

// Mode with ties broken by `order` (the form's option order).
function mode<T extends string>(
  values: T[],
  order: readonly T[],
): { value: T; count: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T = order[0];
  let bestCount = 0;
  for (const option of order) {
    const count = counts.get(option) ?? 0;
    if (count > bestCount) {
      best = option;
      bestCount = count;
    }
  }
  return { value: best, count: bestCount };
}

export function aggregatePitReports(reports: Doc<"pitReports">[]): PitAggregate | null {
  if (reports.length === 0) return null;
  const total = reports.length;
  const autoReports = reports.filter((r) => r.hasAuto === true);

  const tagCounts = new Map<string, number>();
  for (const r of reports) {
    for (const tag of r.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const tags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const latestWithPhoto = reports
    .filter((r) => r.photoId !== undefined)
    .sort((a, b) => b._creationTime - a._creationTime)[0];

  return {
    scoutCount: total,
    canScoreBalls: { yes: reports.filter((r) => r.canScoreBalls).length, total },
    canClimb: { yes: reports.filter((r) => r.canClimb).length, total },
    hasAuto: { yes: autoReports.length, total },
    autoClimb: {
      yes: autoReports.filter((r) => r.autoClimb === true).length,
      total: autoReports.length,
    },
    storageCapacity: mean(defined(reports.map((r) => r.storageCapacity))),
    ballsPerMatch: mean(defined(reports.map((r) => r.ballsPerMatch))),
    autoBalls: mean(defined(autoReports.map((r) => r.autoBalls))),
    driverRating: mean(reports.map((r) => r.driverRating)),
    defenseRating: mean(reports.map((r) => r.defenseRating)),
    autoSide: mode(defined(autoReports.map((r) => r.autoSide)), ["left", "middle", "right"]),
    autoDepth: mode(defined(autoReports.map((r) => r.autoDepth)), ["close", "middle"]),
    tags,
    notes: [...reports]
      .sort((a, b) => a._creationTime - b._creationTime)
      .filter((r) => r.notes !== undefined && r.notes !== "")
      .map((r) => ({ scoutId: r.scoutId, note: r.notes as string })),
    photoId: latestWithPhoto?.photoId ?? null,
  };
}
