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

## Fix round (review feedback)

Two findings from review, both fixed:

1. **HIGH** — `ScrollArea` in `team-detail.tsx` had `max-h` but its Base UI viewport is `height:100%`, which resolves to `auto` with no bounding parent height, so it never actually scrolled and overflow content was unreachable. Replaced with a plain `<div className="-mx-4 max-h-[60vh] overflow-y-auto px-4">` and dropped the now-unused `ScrollArea` import — native CSS overflow does the job, no component needed.
2. **MEDIUM** — the modal only knew a team object or `null`, so it couldn't distinguish "teams still loading" from "id doesn't match any team," and `displayTeam` never cleared once set. Fixed by:
   - Passing `loading={teamsLoading}` (`teams === undefined`) from `teams.tsx` into `TeamDetail`, which now renders "Loading…" while open and the list hasn't resolved yet.
   - `TeamDetail` renders "Team not found." when not loading and `team` is `null`.
   - The `displayTeam` effect now clears to `null` when `selectedTeamId` is set, teams have resolved, and no team matches — so navigating from a valid team to a bad/stale id shows "Team not found" instead of the previous team's data. Closing the modal (`selectedTeamId` becomes `null`) still leaves `displayTeam` alone so the close animation doesn't flash empty.

Re-verified: `bun run typecheck && bun run build && bun run lint` all pass, same two pre-existing warnings in `src/components/ui`, no new ones.
