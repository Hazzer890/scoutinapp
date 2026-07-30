# Per-scout pit reports with crowd aggregation

Date: 2026-07-30
Status: approved

## Problem

Pit scouting is shared: `pitReports.submit` replaces the latest report for a team regardless of who wrote it, so scouts overwrite each other. We want each scout to own their report per team, with team views showing the aggregate across scouts (wisdom of the crowd), mirroring how picklists are already per-user.

## Constraints

- No destructive migration. Do not delete or rewrite existing users or reports. Existing `pitReports` rows already carry `scoutId` and there is at most one per team, so they are valid per-scout reports as-is.
- Aggregates computed on read. FRC scale (~60 teams × a handful of scouts) makes a materialized table unnecessary.

## Data model

`pitReports` fields unchanged. Add index `by_team_scout ["teamId", "scoutId"]`. Invariant: one report per (team, scout), enforced by the upsert in `submit`.

## Backend

- `pitReports.submit`: upsert by (team, scout) via the new index. A scout edits only their own report.
- `pitReports.getForTeam` → rename to `getMine`: returns the calling user's report for the team. Two call sites: `scout-form.tsx` switches to `getMine` (prefill/edit); `team-detail.tsx` switches to `aggregateForTeam`.
- New `pitReports.aggregateForTeam({ teamId })` returning:
  - `scoutCount`
  - Means (1 decimal place) over reports that set the field: `ballsPerMatch`, `storageCapacity`, `autoBalls`, `driverRating`, `defenseRating`
  - Booleans as `{ yes, total }` counts: `canScoreBalls`, `canClimb`, `hasAuto`, `autoClimb`
  - Mode with count for `autoSide`, `autoDepth` (among reports with `hasAuto`)
  - Tags unioned as `[{ tag, count }]`, sorted by count desc
  - Notes as `[{ scoutName, note }]`
  - `photoUrl` from the most recent report with a photo
  - `null` when no reports exist
- `stats.forEvent` / `forTeam`: `ballsPerMatch` becomes the mean across that team's reports; benchmark % compares against the benchmark team's mean.
- `teams.listWithStatus`: replace `pitScouted` with `scoutedByMe: boolean` and `scoutCount: number`.

## Frontend

- Scout grid (`scout.tsx`): green check when `scoutedByMe`; show a small "n scouts" count on teams with reports from others.
- Scout form (`scout-form.tsx`): prefills from the caller's own report only.
- Team detail (`team-detail.tsx`): consensus view. Averaged stat tiles; boolean rows in "3/4 say climbs" form; auto side/depth shown as the mode; tags with ×n counts; notes listed with scout name; latest photo.

## Error handling

No reports → team detail shows "Not scouted yet" (existing behavior, driven by the `null` aggregate). Fields no scout filled in are omitted from the aggregate.

## Testing

- Convex tests: two scouts submit for the same team without clobbering each other; resubmit replaces only the caller's report; aggregation math (means, boolean counts, mode, tag counts, benchmark from mean).
- `npm run e2e` wipes and reseeds dev Convex data; confirm with the user before running if real data exists.
