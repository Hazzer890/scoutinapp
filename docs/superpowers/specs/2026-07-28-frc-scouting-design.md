# scoutinapp — 2026 FRC Scouting App Design

Date: 2026-07-28. Approved by Harry.

Mobile-first scouting app for the 2026 FRC game on the existing scaffold (Vite, React 19, TS strict, React Router 7 SPA, Tailwind v4, shadcn/ui on Base UI, Convex + Convex Auth, Zustand for ephemeral UI state, next-themes, Sonner).

## Roles

`users.role`: `"admin" | "scout"`. The first user to sign up becomes admin; admins promote/demote others from the Admin page. Admin-only: event setup, TBA import, editing imported data, primary pick list, merge tool, viewing all users' data and picklists. Every mutation checks role server-side.

## Data model (Convex tables)

- `events`: `tbaKey`, `name`, `isActive`. One active event at a time; all other tables scope rows by `eventId`.
- `teams`: `eventId`, `tbaKey` ("frc4414"), `number`, `nickname`, `city`, `stateProv`, `country`. Admin-editable; manual add/edit/delete supported (manual teams have no `tbaKey`).
- `matches`: `eventId`, `tbaKey` ("2026auwarp_qm10"), `matchNumber`, `redTeams: number[]`, `blueTeams: number[]`, `scheduledTime?`. Quals only.
- `pitReports`: `teamId`, `scoutId`, scoring capability checkboxes (`canScoreBalls`, plus short enumerated abilities), `canClimb: boolean`, `driverRating` 1–10, `defenseRating` 1–10, `tags: string[]` (preset chips: Fast, Good driver, Plays defense, Tippy, Broke down, Inconsistent — plus free-form add), `photoId?` (Convex file storage), `notes?` (short). One per team (latest wins; editable).
- `matchReports`: `teamId`, `matchId?`, `matchNumber`, `scoutId`, `ballsScored`, `ballsMissed`, `maxStorage` (steppers), `climbAttempted`/`climbSucceeded`, `playedDefense`, `tags`, `notes?`.
- `picklists`: `ownerId?` (absent = the primary list, admin-only), `eventId`, `entries: { teamId, tier, rank }[]`. Tiers: `S` (max 2), `A`, `B`, `C`, `D`, `DNP`. Teams not in `entries` are Uncategorized. Personal list auto-created on first use; primary starts blank.

No stats are stored — all derived in queries.

## Derived stats

- **Accuracy** = ballsScored ÷ (ballsScored + ballsMissed), per report; team value is the mean across reports, shown as %.
- **Throughput** = ballsScored ÷ teleop length (constant, 135 s), averaged across reports. Displayed as **% of team 4788's average throughput** (4788 is the benchmark). If 4788 has no match reports at the event, show raw balls/sec.
- **Storage** = mean of `maxStorage`, shown as integer-ish average.
- **Avg balls** = mean ballsScored per match.

## TBA import

Convex action (Node) using `TBA_API_KEY` from deployment env (`X-TBA-Auth-Key` header). Admin enters an event key (e.g. `2026auwarp`) → fetch `/event/{key}/teams/simple` and `/event/{key}/matches/simple` (filter `comp_level === "qm"`) → upsert by `tbaKey` into `teams`/`matches`. Re-import is idempotent; it overwrites TBA-sourced fields, so admin edits to those fields survive only until the next import (deliberate simplification). No rankings/EPA/OPR/awards/playoffs/colors/videos.

## Pages & navigation

Header nav (hamburger via shadcn Sheet on mobile): **Home**, **Teams**, **Pit Scouting**, **Match Scouting**, **Pick List**, **Admin** (admin only). Each section has a landing/dashboard area — not straight into forms.

1. **Home** — event name, progress counters (teams scouted, match reports filed), quick links. React bits used for visual polish (animated counters, subtle backgrounds).
2. **Teams** — list/cards: number, nickname, pit status (Not Scouted/Scouted), match report count, tier (from viewer's personal list; admin sees primary tier). Tap → Team Detail modal (Dialog on desktop, Sheet on mobile): number, nickname, location, pit answers + photo, match reports, derived averages, tier.
3. **Pit Scouting landing** — grid of team tiles with scouted status; tap a tile → pit form.
4. **Match Scouting landing** — schedule list (match number, red/blue teams, time); pick match → pick robot → match form. Fallback selector for manual match/team entry.
5. **Pick List** — kanban board (columns: S, A, B, C, D, Do Not Pick, Uncategorized) using dnd-kit; drag between/within columns; S column rejects a third card. Cards: number, nickname, pit status, avg balls, avg stats (accuracy %, throughput %). Personal board for scouts. Admin additionally: primary board, per-scout board viewer, and **merge tool** — consensus score per team = mean over personal lists of (tier value + within-tier position bonus); preview of merged ordering → apply to primary → hand-adjust.
6. **Admin** — event setup (TBA key entry + import, import status), manual team CRUD, match schedule edit, user role management.

## Mobile UX rules

Large buttons, minimal typing, stepper buttons for counts, checkbox chips for capabilities/tags, simple selectors, one clear submit + Sonner toast, no dense tables on scouting forms. Pick list + event setup may assume desktop; scouting must feel good on phones.

## Error handling

TBA action surfaces failures (bad key, network, 404 event) as returned error strings → toast. Forms validate client-side (required steppers default 0; ratings default unset must be chosen). All queries scope to active event; empty states everywhere (no event yet, no teams, no reports).

## Testing

Convex function tests via `convex-test` + Vitest for: role checks, TBA upsert idempotency, derived stats math, consensus merge, S-tier cap. Playwright smoke: sign in → import fixture teams (seeded, not live TBA) → pit scout a team → file a match report → drag on pick list.

## Build approach

Implementation plan splits work into subagent-sized parallel tasks along module boundaries (backend schema/functions, TBA import, scouting forms, team pages, pick list board, admin/merge), per the plan doc.
