# Scout Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/leaderboard` page ranking scouts by teams scouted at the active event, ties broken by who reached that count first.

**Architecture:** One Convex query (`pitReports.leaderboard`) groups active-event reports by scout and sorts count desc / latest-report-time asc. One new route renders the ranked list with medal badges for the top 3 and a highlight on the caller's row.

**Tech Stack:** Convex query + convex-test, React 19 + react-router 7 + Tailwind.

## Global Constraints

- Run tests with `npm test`, typecheck with `npm run typecheck`. Do NOT run `npm run e2e` without asking the user (wipes/reseeds dev Convex data).
- Follow existing patterns: Convex object syntax with `args`/`returns` validators; routes gate on `AuthLoading`/`Unauthenticated`/`Authenticated` like `src/routes/scout.tsx`.
- Spec: `docs/superpowers/specs/2026-07-30-scout-leaderboard-design.md`.

---

### Task 1: `pitReports.leaderboard` query

**Files:**
- Modify: `convex/pitReports.ts` (append the query at the end)
- Test: `convex/tests/reports.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `pitReports.by_event` index; `getActiveEvent(ctx)` from `convex/events.ts`; `requireUser` from `convex/model/authz.ts`; existing test helpers `createUser`/`createEvent`/`createTeam`/`submitPit` in `reports.test.ts`.
- Produces: `api.pitReports.leaderboard` (no args) → `{ scoutId: Id<"users">; scoutName: string; count: number }[]` sorted count desc, then earliest max-`_creationTime` asc. Task 2 renders this.

- [ ] **Step 1: Write the failing test**

Append to `convex/tests/reports.test.ts`:

```ts
describe("pitReports.leaderboard", () => {
  test("ranks by count desc, ties broken by earliest finish", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamA = await createTeam(t, eventId, 100);
    const teamB = await createTeam(t, eventId, 200);
    const alice = await createUser(t, "scout");
    const bob = await createUser(t, "scout");
    const carol = await createUser(t, "scout");
    await t.run((ctx) => ctx.db.patch(alice, { name: "Alice" }));
    await t.run((ctx) => ctx.db.patch(bob, { name: "Bob" }));

    // Bob scouts 2 teams and finishes before Alice scouts her 2 teams.
    await submitPit(t, bob, teamA);
    await submitPit(t, bob, teamB);
    await submitPit(t, alice, teamA);
    await submitPit(t, alice, teamB);
    // Carol scouts 1 team. Unnamed → "Scout".
    await submitPit(t, carol, teamA);
    // Alice edits an existing report — must NOT reset her finish time.
    await submitPit(t, alice, teamA, 9);

    const board = await t.withIdentity({ subject: alice }).query(api.pitReports.leaderboard, {});
    expect(board).toEqual([
      { scoutId: bob, scoutName: "Bob", count: 2 },
      { scoutId: alice, scoutName: "Alice", count: 2 },
      { scoutId: carol, scoutName: "Scout", count: 1 },
    ]);
  });

  test("returns [] when there is no active event", async () => {
    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    const board = await t.withIdentity({ subject: scoutId }).query(api.pitReports.leaderboard, {});
    expect(board).toEqual([]);
  });
});
```

Note: `submitPit(t, scout, team, balls?)` already exists in this file. Convex-test assigns increasing `_creationTime`s, so submit order fixes the tiebreak; `db.replace` (the edit path) preserves `_creationTime`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- reports`
Expected: FAIL — `api.pitReports.leaderboard` does not exist.

- [ ] **Step 3: Implement the query**

In `convex/pitReports.ts`, add `import { getActiveEvent } from "./events";` to the imports, then append:

```ts
export const leaderboard = query({
  args: {},
  returns: v.array(
    v.object({ scoutId: v.id("users"), scoutName: v.string(), count: v.number() }),
  ),
  handler: async (ctx) => {
    await requireUser(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return [];
    const reports = await ctx.db
      .query("pitReports")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();

    const byScout = new Map<Id<"users">, { count: number; lastAt: number }>();
    for (const report of reports) {
      const entry = byScout.get(report.scoutId) ?? { count: 0, lastAt: 0 };
      entry.count++;
      entry.lastAt = Math.max(entry.lastAt, report._creationTime);
      byScout.set(report.scoutId, entry);
    }

    const ranked = [...byScout.entries()].sort(
      ([, a], [, b]) => b.count - a.count || a.lastAt - b.lastAt,
    );
    return await Promise.all(
      ranked.map(async ([scoutId, { count }]) => {
        const scout = await ctx.db.get(scoutId);
        return { scoutId, scoutName: scout?.name ?? "Scout", count };
      }),
    );
  },
});
```

Also add `Id` to the dataModel type imports if not present: `import type { Id } from "./_generated/dataModel";`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- reports`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/pitReports.ts convex/tests/reports.test.ts
git commit -m "feat: scout leaderboard query"
```

---

### Task 2: `/leaderboard` page + navigation

**Files:**
- Create: `src/routes/leaderboard.tsx`
- Modify: `src/router.tsx` (add route)
- Modify: `src/components/card-nav.tsx` (add link to the "Scout" card, ~line 42)
- Modify: `src/routes/home.tsx` (add quick link)

**Interfaces:**
- Consumes: `api.pitReports.leaderboard` (Task 1), `api.users.me` (existing; returns the current user with `_id`).

- [ ] **Step 1: Create the page**

`src/routes/leaderboard.tsx`:

```tsx
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { api } from '../../convex/_generated/api'
import { cn } from '@/lib/utils'

const MEDAL_STYLES = [
  'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300', // gold
  'bg-slate-400/20 text-slate-600 dark:text-slate-300', // silver
  'bg-orange-500/20 text-orange-700 dark:text-orange-300', // bronze
]

function Leaderboard() {
  const board = useQuery(api.pitReports.leaderboard)
  const me = useQuery(api.users.me)

  if (board === undefined) {
    return <p className="text-muted-foreground">Loading…</p>
  }
  if (board.length === 0) {
    return (
      <p className="text-muted-foreground">
        No reports yet.{' '}
        <Link to="/scout" className="underline">
          Go scout some teams!
        </Link>
      </p>
    )
  }

  return (
    <ol className="space-y-2">
      {board.map((entry, i) => (
        <li
          key={entry.scoutId}
          className={cn(
            'flex items-center gap-3 rounded-lg border bg-card p-3 text-card-foreground',
            entry.scoutId === me?._id && 'border-primary',
          )}
        >
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
              MEDAL_STYLES[i] ?? 'bg-muted text-muted-foreground',
            )}
          >
            {i + 1}
          </span>
          <span className="flex-1 truncate font-medium">
            {entry.scoutName}
            {entry.scoutId === me?._id && <span className="text-muted-foreground"> (you)</span>}
          </span>
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{entry.count}</span>{' '}
            team{entry.count === 1 ? '' : 's'}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function LeaderboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Scout Leaderboard</h1>
      <AuthLoading>
        <p className="text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">
          Sign in to see the leaderboard.{' '}
          <Link to="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </Unauthenticated>
      <Authenticated>
        <Leaderboard />
      </Authenticated>
    </div>
  )
}
```

- [ ] **Step 2: Wire the route and nav**

`src/router.tsx`: add `import { LeaderboardPage } from '@/routes/leaderboard'` and, after the `picklist` child route:

```tsx
      { path: 'leaderboard', Component: LeaderboardPage },
```

`src/components/card-nav.tsx`: in the `cards` array, add to the "Scout" card's links:

```tsx
        { to: '/leaderboard', label: 'Leaderboard' },
```

`src/routes/home.tsx`: find the `quickLinks` array and add `{ to: '/leaderboard', label: 'Leaderboard' }`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: both PASS. If dev servers are running, load http://localhost:5173/leaderboard and confirm the ranked list renders with the current user's row outlined.

- [ ] **Step 4: Commit**

```bash
git add src/routes/leaderboard.tsx src/router.tsx src/components/card-nav.tsx src/routes/home.tsx
git commit -m "feat: scout leaderboard page"
```
