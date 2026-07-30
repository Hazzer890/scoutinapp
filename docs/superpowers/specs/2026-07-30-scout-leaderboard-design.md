# Scout leaderboard

Date: 2026-07-30
Status: approved

## Problem

Scouting is per-user (see 2026-07-30-per-scout-reports-design.md). To create competition and reward for scouts, add a leaderboard page ranking scouts by how many teams they have scouted at the active event.

## Backend

New query `pitReports.leaderboard` (no args):

- Fetch the active event's pit reports via the `by_event` index. No active event or no reports → `[]`.
- Group by `scoutId`: `count` = number of reports (one report = one distinct team, guaranteed by the per-(team, scout) upsert), `lastAt` = max `_creationTime`.
- Sort: `count` desc, then `lastAt` asc — the scout who reached that count first ranks higher. Convex `db.replace` preserves `_creationTime`, so editing a report never moves a scout's time; only scouting a new team does.
- Resolve names (`name ?? "Scout"`). Return `[{ scoutId, scoutName, count }]`. `scoutId` lets the client highlight the caller's row.

## Frontend

New route `/leaderboard` (`src/routes/leaderboard.tsx`), auth-gated like other pages:

- Full ranked list of every scout with ≥ 1 report: rank number, name, team count.
- Ranks 1-3 get medal-colored rank badges (gold/silver/bronze); the caller's own row is highlighted.
- Empty state: "No reports yet. Go scout some teams!"
- Nav: link in the "Scout" card of `card-nav.tsx`; quick-link button on the home page.

## Error handling

Nothing beyond existing patterns: `requireUser`, loading/empty states.

## Testing

Convex test for `leaderboard`: counts per scout, count-desc order, earliest-`lastAt` tiebreak, name fallback to "Scout".
