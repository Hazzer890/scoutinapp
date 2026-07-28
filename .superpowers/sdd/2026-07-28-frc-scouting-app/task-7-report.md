# Task 7 report: Teams list + team detail modal

## Status
Complete.

## Files changed
- `src/routes/teams.tsx` — replaced placeholder. Renders `TeamsPage` (auth-gated like `home.tsx`), a search input (number/nickname substring match), and a responsive list (stacked card on mobile, single row on `sm:` and up) built from `api.teams.listWithStatus`. Each row is a `Link` to `/teams?team=<id>` so the selection is a real shareable URL, read back via `useSearchParams`.
- `src/components/team-detail.tsx` — new file. Exports `TeamDetail` (Dialog on `sm:` and up, bottom `Sheet` below, switched via a `useSyncExternalStore` matchMedia hook on `(min-width: 640px)`), plus reusable `TierBadge` and `PitStatusBadge` used by both the list and the detail view. Internal `TeamDetailBody` queries `api.stats.forTeam`, `api.pitReports.getForTeam`, `api.matchReports.listForTeam` for the selected team and renders match-stat tiles, pit answers (photo, ratings, capability flags, tags, notes), and a compact match-report card list (sorted by match number).

## Design notes
- Personal tier badge always shown; admins additionally see the primary-list tier labeled "Primary:" when it differs from their personal tier (both list rows and detail header).
- `stats.forEvent` was not needed directly — `stats.forTeam` covers the detail view's averages, and `listWithStatus` already carries per-team match/pit counts for the list, so `forEvent` was skipped (YAGNI; only one screen needed per-team stats, not the whole event map).
- `throughputPctOfBenchmark` renders as a percentage when non-null; falls back to raw `throughputBps` balls/sec when there's no benchmark team seeded (missing-key/null case from the brief).
- The dialog/sheet keeps rendering the last-selected team's data during the close animation (a small `useEffect` cache in `teams.tsx`) so content doesn't flash empty mid-transition.

## Verification
`bun run typecheck && bun run build && bun run lint` all pass — lint shows only the two pre-existing warnings in `src/components/ui` (button.tsx, tabs.tsx), no new warnings. No Playwright run (explicitly deferred to E2E task; no live Convex deployment/auth wired into this worktree to exercise real data).

## Concerns
- Detail view was not visually verified in a live browser (no `.env.local` / running Convex dev deployment in this worktree, and the brief forbids running the Convex CLI here). Typecheck confirms all query return types line up with the UI's field access, but actual visual polish (spacing, badge contrast in dark mode) is unverified against a live app.
- Tier colors (S/A/B/C/D/DNP) are a simple fixed palette I chose; no existing tier-badge convention existed elsewhere in the app to match against.
