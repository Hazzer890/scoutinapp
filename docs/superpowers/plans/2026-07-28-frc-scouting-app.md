# FRC 2026 Scouting App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full scouting app from `docs/superpowers/specs/2026-07-28-frc-scouting-design.md` — TBA import, pit/match scouting, team pages, kanban pick lists with consensus merge — on the existing scaffold.

**Architecture:** Convex is the single source of truth (schema + functions first, in dependency order), then parallel frontend tracks per page area behind stable query/mutation contracts. Derived stats are computed in queries, never stored.

**Tech Stack:** Existing scaffold (Bun, Vite, React 19, TS strict, React Router 7 library mode, Tailwind v4, shadcn/ui on Base UI, Convex + Convex Auth password provider, Zustand, next-themes, Sonner). Added by this plan: `convex-test` + `vitest` + `@edge-runtime/vm` (backend tests), `@dnd-kit/core` + `@dnd-kit/sortable` (kanban), react bits components (copy-paste, no package).

## Global Constraints

- Bun only: `bun`, `bunx`, `bun run`. Convex CLI via package scripts or `npx convex` — **never `bunx convex` (hangs on this machine)**.
- TypeScript strict; `bun run typecheck`, `bun run lint`, and `bun run build` must pass at every commit.
- Every Convex function declares `args` AND `returns` validators. Public functions enforce authz server-side (`requireUser` / `requireAdmin`).
- shadcn components (Base UI implementation) for all form controls — never hand-rolled inputs. Add missing ones with `bunx shadcn@latest add <name>`.
- Convex data never mirrored into Zustand; Zustand only for ephemeral UI state (open modals, drag state, selected items).
- Mobile-first on scouting surfaces: large buttons, steppers, chips, no dense tables. Desktop-ok: pick list, admin.
- Game constants: `TELEOP_SECONDS = 135`, `BENCHMARK_TEAM = 4788`, S tier max 2 teams.
- Commit after every task (repo is a fresh git repo on `main`).

## Agent assignments

Per-task worker in each task header. Rationale: Convex backend → `convex:convex-expert` plugin agent (knows validators/index/authz patterns); user-facing UI → taste ≥ 7 (sonnet-5 baseline, opus-4.8 for the kanban board, the most interaction-heavy surface); E2E test authoring → codex wrapper (`codex:terra:e2e`, mechanical, near-free); final review → fable-5 plus `codex:sol` independent pass.

**Waves** (parallel dispatch within a wave; worktree isolation for every parallel writer):
- Wave 1: Task 1 (solo — everything depends on the schema)
- Wave 2: Tasks 2, 4, 5 (parallel, disjoint convex/ files)
- Wave 3: Task 3 (needs Task 2's teams/matches tables in place… they're in schema from Task 1; needs Task 2's list queries only for verification — run after 2), Task 6 (solo frontend shell; can start parallel with Task 3)
- Wave 4: Tasks 7, 8, 9, 10, 11 (parallel frontend, worktrees)
- Wave 5: Task 12 (E2E + review, after merge of all)

---

### Task 1: Schema, roles, authz helpers, test harness

**Agent:** `convex:convex-expert`

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/auth.ts` (role bootstrap callback)
- Create: `convex/model/authz.ts`
- Create: `convex/lib/constants.ts`
- Create: `convex/tests/authz.test.ts`
- Modify: `package.json` (test script + dev deps)

**Interfaces:**
- Produces (all later tasks rely on these exact names):
  - Tables: `events`, `teams`, `matches`, `pitReports`, `matchReports`, `picklists` as below; `users` extended with `role`.
  - `convex/model/authz.ts`: `requireUser(ctx): Promise<Doc<"users">>` (throws "Not signed in"), `requireAdmin(ctx): Promise<Doc<"users">>` (throws "Admin only").
  - `convex/lib/constants.ts`: `TELEOP_SECONDS = 135`, `BENCHMARK_TEAM = 4788`, `TIERS = ["S","A","B","C","D","DNP"] as const`, `tierValidator = v.union(...TIERS.map(v.literal))`, `S_TIER_MAX = 2`, `PRESET_TAGS = ["Fast","Good driver","Plays defense","Tippy","Broke down","Inconsistent"]`.

- [ ] **Step 1: Install test deps** — `bun add -d convex-test vitest @edge-runtime/vm` and add `"test": "vitest run"` script.
- [ ] **Step 2: Write the schema** (exact):

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { tierValidator } from "./lib/constants";

export default defineSchema({
  ...authTables,
  users: defineTable({
    // authTables.users fields, copied so we can extend:
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal("admin"), v.literal("scout"))),
  }).index("email", ["email"]),
  events: defineTable({
    tbaKey: v.string(),
    name: v.string(),
    isActive: v.boolean(),
  }),
  teams: defineTable({
    eventId: v.id("events"),
    tbaKey: v.optional(v.string()),
    number: v.number(),
    nickname: v.string(),
    city: v.optional(v.string()),
    stateProv: v.optional(v.string()),
    country: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_number", ["eventId", "number"]),
  matches: defineTable({
    eventId: v.id("events"),
    tbaKey: v.optional(v.string()),
    matchNumber: v.number(),
    redTeams: v.array(v.number()),
    blueTeams: v.array(v.number()),
    scheduledTime: v.optional(v.number()),
  }).index("by_event_match", ["eventId", "matchNumber"]),
  pitReports: defineTable({
    eventId: v.id("events"),
    teamId: v.id("teams"),
    scoutId: v.id("users"),
    canScoreBalls: v.boolean(),
    canClimb: v.boolean(),
    storageCapacity: v.optional(v.number()),
    driverRating: v.number(),
    defenseRating: v.number(),
    tags: v.array(v.string()),
    photoId: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
  }).index("by_team", ["teamId"]),
  matchReports: defineTable({
    eventId: v.id("events"),
    teamId: v.id("teams"),
    matchId: v.optional(v.id("matches")),
    matchNumber: v.number(),
    scoutId: v.id("users"),
    ballsScored: v.number(),
    ballsMissed: v.number(),
    maxStorage: v.number(),
    climbAttempted: v.boolean(),
    climbSucceeded: v.boolean(),
    playedDefense: v.boolean(),
    tags: v.array(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_team", ["teamId"])
    .index("by_event", ["eventId"])
    .index("by_scout", ["scoutId"]),
  picklists: defineTable({
    eventId: v.id("events"),
    ownerId: v.optional(v.id("users")), // absent = primary (admin-only) list
    entries: v.array(
      v.object({ teamId: v.id("teams"), tier: tierValidator, rank: v.number() })
    ),
  }).index("by_event_owner", ["eventId", "ownerId"]),
});
```

- [ ] **Step 3: Constants + authz** (exact `authz.ts`):

```ts
// convex/model/authz.ts
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not signed in");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Not signed in");
  return user;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new Error("Admin only");
  return user;
}
```

- [ ] **Step 4: Role bootstrap** — in `convex/auth.ts`, add `callbacks.afterUserCreatedOrUpdated(ctx, { userId, existingUserId })`: skip if `existingUserId`; else count users — if this is the only user, patch `role: "admin"`, otherwise `role: "scout"`.
- [ ] **Step 5: Failing tests** in `convex/tests/authz.test.ts` using `convex-test`: (a) first created user gets role admin, second gets scout (drive via `t.run` inserting through the callback path or by unit-calling the callback); (b) `requireAdmin` throws "Admin only" for a scout identity. Run `bun run test` → expect FAIL before implementation, PASS after.
- [ ] **Step 6: Push + verify** — `npx convex dev --once` (codegen + typecheck), `bun run typecheck`.
- [ ] **Step 7: Commit** — `feat: scouting schema, roles, authz helpers, test harness`.

---

### Task 2: Events, teams, matches functions

**Agent:** `convex:convex-expert` (Wave 2, worktree)

**Files:** Create `convex/events.ts`, `convex/teams.ts`, `convex/matches.ts`, `convex/tests/teams.test.ts`

**Interfaces:**
- Consumes: Task 1 schema, `requireUser`/`requireAdmin`.
- Produces:
  - `events.getActive: query({}) → Doc<"events"> | null`
  - `events.setActive: mutation({ tbaKey: string, name: string }) → Id<"events">` (admin; deactivates others; upserts by tbaKey)
  - `teams.list: query({}) → Doc<"teams">[]` (active event, sorted by number)
  - `teams.listWithStatus: query({}) → Array<Doc<"teams"> & { pitScouted: boolean; matchReportCount: number; personalTier: Tier | null; primaryTier: Tier | null }>` (requireUser; batch-computed: fetch all pit reports/match reports/picklists for the event once, then join in memory — no per-team queries)
  - `teams.get: query({ teamId: Id<"teams"> }) → Doc<"teams"> | null`
  - `teams.upsertManual: mutation({ teamId?: Id<"teams">, number, nickname, city?, stateProv?, country? }) → Id<"teams">` (admin)
  - `teams.remove: mutation({ teamId }) → null` (admin; also deletes that team's reports and picklist entries)
  - `matches.list: query({}) → Doc<"matches">[]` (active event, by matchNumber)
  - `matches.upsertManual: mutation({ matchId?, matchNumber, redTeams: number[], blueTeams: number[], scheduledTime? }) → Id<"matches">` (admin), `matches.remove: mutation({ matchId }) → null` (admin)

- [ ] Write failing convex-test tests: role enforcement on mutations; `listWithStatus` returns correct pitScouted/matchReportCount for seeded data; `setActive` deactivates the previous event.
- [ ] Implement; every function with full `args`/`returns` validators.
- [ ] `bun run test`, `npx convex dev --once`, `bun run typecheck` → PASS. Commit `feat: event/team/match functions`.

---

### Task 3: TBA import

**Agent:** `convex:convex-expert` (Wave 3, worktree)

**Files:** Create `convex/tba.ts` (action, `"use node"`), `convex/tbaImport.ts` (internal mutation + internal query), `convex/tests/tbaImport.test.ts`

**Interfaces:**
- Consumes: schema; `requireAdmin` pattern via internal query `tbaImport.checkAdmin` (actions have no db — check role through `ctx.runQuery`).
- Produces: `tba.importEvent: action({ eventKey: string }) → { ok: true; teams: number; matches: number } | { ok: false; error: string }`; `internal.tbaImport.applyImport: internalMutation({ eventKey, eventName, teams: [...], matches: [...] }) → { teams: number; matches: number }`.

- [ ] Action: read `process.env.TBA_API_KEY` (error string if unset); GET `https://www.thebluealliance.com/api/v3/event/{eventKey}` (name), `/event/{eventKey}/teams/simple`, `/event/{eventKey}/matches/simple` with header `X-TBA-Auth-Key`; non-200 → `{ ok:false, error }`. Filter matches to `comp_level === "qm"`; map to `{ tbaKey: m.key, matchNumber: m.match_number, redTeams: m.alliances.red.team_keys.map(k => parseInt(k.slice(3))), blueTeams: ..., scheduledTime: m.time ? m.time * 1000 : undefined }`; teams to `{ tbaKey: t.key, number: t.team_number, nickname: t.nickname ?? String(t.team_number), city, stateProv: t.state_prov, country: t.country }`.
- [ ] `applyImport`: upsert event by tbaKey + set active; upsert teams/matches by `tbaKey` (overwrite TBA-sourced fields; never touch manual teams). Test upsert idempotency with convex-test (call applyImport twice, row counts stable).
- [ ] Verify live once with the real key: `npx convex run tba:importEvent '{"eventKey":"2026auwarp"}'` after env var is set (orchestrator sets `TBA_API_KEY` via Convex MCP envSet — ask Harry for the key at dispatch time).
- [ ] Tests/typecheck pass → commit `feat: TBA event import`.

---

### Task 4: Reports + derived stats

**Agent:** `convex:convex-expert` (Wave 2, worktree)

**Files:** Create `convex/pitReports.ts`, `convex/matchReports.ts`, `convex/stats.ts`, `convex/lib/statsMath.ts` (pure functions), `convex/tests/stats.test.ts`

**Interfaces:**
- Consumes: schema, authz, constants.
- Produces:
  - `pitReports.getForTeam: query({ teamId }) → Doc<"pitReports"> & { photoUrl: string | null } | null` (one pit report per team; latest wins)
  - `pitReports.submit: mutation({ teamId, canScoreBalls, canClimb, storageCapacity?, driverRating, defenseRating, tags, photoId?, notes? }) → null` (requireUser; upsert by teamId)
  - `pitReports.generateUploadUrl: mutation({}) → string`
  - `matchReports.submit: mutation({ teamId, matchNumber, matchId?, ballsScored, ballsMissed, maxStorage, climbAttempted, climbSucceeded, playedDefense, tags, notes? }) → null` (requireUser)
  - `matchReports.listForTeam: query({ teamId }) → Array<Doc<"matchReports"> & { scoutName: string | null }>`
  - `stats.forEvent: query({}) → Record<teamIdString, TeamStats>` and `stats.forTeam: query({ teamId }) → TeamStats | null` where `TeamStats = { matchCount: number; avgBalls: number; accuracy: number | null; throughputBps: number; throughputPctOfBenchmark: number | null; avgStorage: number; climbSuccessRate: number | null }`
- Pure math in `statsMath.ts` (unit-tested without db): `computeTeamStats(reports: MatchReportLike[]): TeamStats`, `benchmarkPct(teamBps: number, benchmarkBps: number | null): number | null`.

- [ ] Failing unit tests for the math: accuracy = scored/(scored+missed) (null when both 0); throughputBps = avgBalls / TELEOP_SECONDS; pct = teamBps/benchmarkBps*100, null when 4788 has no reports; climbSuccessRate counts only attempted.
- [ ] Implement math, then functions. `stats.forEvent` reads all event matchReports via `by_event` in one pass, groups by team, computes benchmark from team 4788's group.
- [ ] convex-test: pit upsert (second submit replaces), authz on submit. All green → commit `feat: pit/match reports and derived stats`.

---

### Task 5: Picklists + consensus merge

**Agent:** `convex:convex-expert` (Wave 2, worktree). After completion, request a `fable` review of the merge math before merging the worktree.

**Files:** Create `convex/picklists.ts`, `convex/lib/consensus.ts`, `convex/tests/picklists.test.ts`

**Interfaces:**
- Consumes: schema, authz, constants (`TIERS`, `S_TIER_MAX`).
- Produces:
  - `picklists.getMine: query({}) → { entries: Entry[] }` (auto-created empty on first mutation; query returns `{entries: []}` if none), `Entry = { teamId, tier, rank }`
  - `picklists.getPrimary: query({}) → { entries: Entry[] }` (admin)
  - `picklists.listAll: query({}) → Array<{ scoutId, scoutName: string | null, entries: Entry[] }>` (admin)
  - `picklists.moveEntry: mutation({ scope: "mine" | "primary", teamId, tier: Tier | null, rank: number }) → null` — tier null removes to Uncategorized; inserting into S when it has `S_TIER_MAX` entries throws "S tier is full"; ranks within affected tiers are renumbered 0..n contiguously; `scope: "primary"` requires admin
  - `picklists.mergePreview: query({}) → Array<{ teamId, score: number, tier: Tier, lists: number }>` (admin)
  - `picklists.applyMerge: mutation({}) → null` (admin; writes mergePreview result into the primary list)
- `consensus.ts` pure function: `mergeLists(lists: Entry[][], allTeamIds: Id<"teams">[]): Array<{ teamId; score; tier; lists }>`.

**Consensus algorithm (exact):** tier values S=6 A=5 B=4 C=3 D=2 DNP=0. Per list, a categorized team scores `tierValue + 0.5 * (1 - rank / countInThatTier)`. A team's consensus score = mean over lists that categorized it; teams categorized by no list stay Uncategorized (excluded from output). Output sorted by score desc. Tier assignment: if >50% of the lists that categorized the team marked it DNP → DNP; else tier = TIERS value whose tierValue is closest to the score (round half DOWN — an exact-boundary score stays in the lower tier, so a unanimous "#1 of B" merges as B, not A; amended 2026-07-28 after review found round-half-up promoted every top-of-tier pick); S overflow beyond 2 demotes to top of A. Ranks assigned 0..n within each output tier following the score order.

- [ ] Failing unit tests for `mergeLists`: mean-of-tiers, position bonus ordering, DNP majority rule, S cap demotion, uncategorized exclusion.
- [ ] Failing convex-tests: S-cap throws on `moveEntry`, scope authz, rank renumbering stays contiguous after cross-tier moves, `applyMerge` overwrites primary.
- [ ] Implement; green; commit `feat: picklists and consensus merge`.

---

### Task 6: App shell, nav, Home dashboard

**Agent:** `sonnet` (Wave 3; solo on main checkout)

**Files:**
- Modify: `src/router.tsx`, `src/routes/root.tsx`
- Create: `src/routes/home.tsx` (replace placeholder), `src/components/app-nav.tsx`, `src/components/require-admin.tsx`, `src/stores/ui.ts` (extend)

**Interfaces:**
- Consumes: `api.events.getActive`, `api.users.me` (has `role`), `api.teams.listWithStatus`.
- Produces (routes all later tasks mount under): `/` home, `/teams`, `/pit`, `/pit/:teamId`, `/matches`, `/matches/:matchNumber/:teamNumber`, `/picklist`, `/admin`. `RequireAdmin` wrapper component redirects non-admins to `/`. Nav component: desktop horizontal links + mobile hamburger (shadcn Sheet), items Home/Teams/Pit Scouting/Match Scouting/Pick List (+Admin when `me.role === "admin"`), active-route highlight, sign-in/out + ModeToggle preserved.
- Home: active event name (or "No active event" empty state pointing admins to /admin), progress stat cards — teams scouted x/y, total match reports — using a react bits animated counter (copy the CountUp component from reactbits.dev into `src/components/reactbits/count-up.tsx`), quick-link buttons to the four sections. Placeholder routes for pages owned by Tasks 7–11 render a `<PagePlaceholder name>` so the shell compiles standalone.
- [ ] Build, verify on mobile viewport (375px) with Playwright: hamburger opens, all nav items navigate. `bun run typecheck && bun run build`. Commit `feat: app shell, nav, home dashboard`.

---

### Task 7: Teams list + team detail modal

**Agent:** `sonnet` (Wave 4, worktree)

**Files:** Create `src/routes/teams.tsx`, `src/components/team-detail.tsx`

**Interfaces:**
- Consumes: `api.teams.listWithStatus`, `api.stats.forEvent`, `api.pitReports.getForTeam`, `api.matchReports.listForTeam`, `api.users.me`.
- Behavior: responsive card list (cards on mobile, comfortable rows on desktop) showing number, nickname, pit status badge (`Scouted` green / `Not Scouted` muted), match report count, tier badge (viewer's personal tier; admins see primary tier alongside). Search-by-number/nickname input at top. Tap → detail in shadcn Dialog (desktop) / Sheet side="bottom" (mobile): location line, pit answers incl. photo + ratings + tags, match report list (compact cards, not a dense table), averages from `stats.forTeam`, current tier. Selected team id lives in the URL (`/teams?team=<id>`) so links are shareable — not Zustand.
- [ ] Typecheck/build; Playwright viewport check both breakpoints. Commit `feat: team list and detail modal`.

---

### Task 8: Pit scouting landing + form

**Agent:** `sonnet` (Wave 4, worktree)

**Files:** Create `src/routes/pit.tsx` (landing grid), `src/routes/pit-form.tsx` (`/pit/:teamId`), `src/components/stepper.tsx` (shared big-button stepper: `{ value, onChange, min?, max?, label }`)

**Interfaces:**
- Consumes: `api.teams.listWithStatus`, `api.pitReports.getForTeam`, `api.pitReports.submit`, `api.pitReports.generateUploadUrl`, `PRESET_TAGS` re-exported through `convex/lib/constants`.
- Landing: tile grid (2-col mobile, wraps up on desktop) — team number big, nickname small, green check overlay when scouted. Tap → form.
- Form (mobile-first, one column, large controls): capability checkboxes (Can score balls, Can climb) as big toggle cards; storage capacity stepper; driver + defense rating as 1–10 segmented button rows; tag chips (preset + free-form add via small input + Add); photo: `<input type="file" accept="image/*" capture="environment">` → upload to `generateUploadUrl` URL → pass storageId to submit; optional short notes textarea; sticky full-width Submit button → toast "Pit report saved" → navigate back to `/pit`. Pre-fills from existing report (editable).
- [ ] Typecheck/build; Playwright 375px pass through the whole form. Commit `feat: pit scouting`.

---

### Task 9: Match scouting landing + form

**Agent:** `sonnet` (Wave 4, worktree)

**Files:** Create `src/routes/matches.tsx`, `src/routes/match-form.tsx` (`/matches/:matchNumber/:teamNumber`)

**Interfaces:**
- Consumes: `api.matches.list`, `api.teams.list`, `api.matchReports.submit`, shared `Stepper` from Task 8 (if racing Task 8 in parallel, include the identical `src/components/stepper.tsx`; merge dedupes).
- Landing: schedule list ordered by match number — match card shows Q# + time (if any) + red alliance numbers (red text) vs blue (blue text). Tap match → six team buttons (3 red, 3 blue) → form. Fallback at top: "Manual entry" — match-number stepper + team select (shadcn Select) → form.
- Form: big steppers for Balls scored / Balls missed / Max balls held; toggle cards: Attempted climb → (if on) Climb succeeded; Played defense; tag chips; optional notes; sticky Submit → toast → back to `/matches`.
- [ ] Typecheck/build; Playwright 375px flow. Commit `feat: match scouting`.

---

### Task 10: Pick list kanban + merge tool

**Agent:** `opus` (Wave 4, worktree) — most interaction-heavy user-facing surface.

**Files:** Create `src/routes/picklist.tsx`, `src/components/kanban/board.tsx`, `src/components/kanban/team-card.tsx`, `src/components/merge-dialog.tsx`. `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`.

**Interfaces:**
- Consumes: `api.picklists.getMine/getPrimary/listAll/moveEntry/mergePreview/applyMerge`, `api.teams.listWithStatus`, `api.stats.forEvent`, `api.users.me`.
- Board: columns S/A/B/C/D/Do Not Pick/Uncategorized (Uncategorized = teams absent from entries). dnd-kit sortable columns; on drop call `moveEntry({ scope, teamId, tier, rank })` (tier null when dropped into Uncategorized); optimistic feel comes from Convex live queries — keep local drag state in Zustand only during the drag. S column shows "2 max" and rejects a third drop client-side (and surfaces the server error as a toast if raced). Card: number, nickname, pit badge, avg balls, accuracy %, throughput % of 4788.
- Scope switcher: scouts see only "My list". Admins get Tabs: My list / Primary / per-scout read-only viewer (select scout from `listAll`) — plus Merge button opening `merge-dialog`: preview table of merged ordering (team, score, tier, #lists) → Apply writes primary → toast.
- Horizontal scroll of columns on mobile (desktop-first quality bar per spec, but must not break on phones).
- [ ] Typecheck/build; manual drag verification via Playwright (drag a card S←→A, assert persistence after reload). Commit `feat: pick list kanban and consensus merge UI`.

---

### Task 11: Admin page

**Agent:** `sonnet` (Wave 4, worktree)

**Files:** Create `src/routes/admin.tsx`, `src/components/admin/event-setup.tsx`, `src/components/admin/team-editor.tsx`, `src/components/admin/match-editor.tsx`, `src/components/admin/user-roles.tsx`. Also create `convex/users.ts` additions: `users.list: query({}) → Array<{ _id, name, email, role }>` (admin), `users.setRole: mutation({ userId, role: "admin" | "scout" }) → null` (admin; cannot demote yourself if you're the last admin).

**Interfaces:**
- Consumes: `api.events.*`, `api.tba.importEvent` (useAction), `api.teams.upsertManual/remove`, `api.matches.upsertManual/remove`, new `api.users.list/setRole`.
- Wrapped in `RequireAdmin`. Sections (shadcn Tabs): **Event** — TBA key input + Import button with loading state, result toast (n teams / n matches or error), active event display; **Teams** — editable list (dialog per team: nickname/location fields), add manual team, delete with confirm dialog; **Matches** — same pattern for schedule rows; **Users** — role select per user.
- [ ] Failing convex-test for `setRole` last-admin guard; implement; green. Typecheck/build. Commit `feat: admin page`.

---

### Task 12: Seed, E2E smoke, final review

**Agent:** E2E authoring via codex wrapper `codex:terra:e2e` (sonnet wrapper, effort low); final review `fable` + independent `codex:sol:review`.

**Files:** Create `convex/seed.ts` (`internal.seed.dev: internalMutation` — creates event "Dev Event", 12 teams incl. 4788, 6 matches, a few reports), `e2e/smoke.spec.ts`, `playwright.config.ts` (`bun add -d @playwright/test`).

- [ ] Seed: `npx convex run seed:dev` idempotent (wipes + recreates dev data; guard: throws if any event has `tbaKey` starting with "2026" and `isActive` — refuse to clobber real data).
- [ ] E2E: sign up fresh user (becomes admin on empty db) → run seed → Teams shows 12 → pit scout team → badge flips to Scouted → file match report via schedule → team detail shows averages → drag team into A on picklist → reload, persists.
- [ ] Run full gate: `bun run test && bun run typecheck && bun run lint && bun run build && bunx playwright test`.
- [ ] Dispatch review agents (fable + codex:sol) over the full diff; fix findings; commit `test: seed + e2e smoke`.

---

## Self-review notes

- Spec coverage checked: every spec section maps to a task (roles→1/11, data model→1, stats→4, TBA→3, pages→6–11, merge→5/10, mobile rules→6–10 constraints, testing→per-task + 12).
- Type consistency: `TeamStats`, `Entry`, tier literals, and function names cross-referenced between Tasks 2/4/5 and 7–11.
- Deliberate simplifications: pit report is per-team not per-scout (latest wins); throughput uses fixed 135 s teleop; re-import overwrites TBA fields. All stated in spec.
