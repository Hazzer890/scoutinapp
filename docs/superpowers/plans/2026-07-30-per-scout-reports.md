# Per-Scout Pit Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each scout owns one pit report per team; team views aggregate all scouts' reports (means, yes/total counts, mode, tag counts).

**Architecture:** Add a `by_team_scout` index and upsert reports per (team, scout). A pure aggregation function in `convex/lib/pitAggregate.ts` computes the crowd view; thin Convex queries wrap it. Frontend swaps `pitScouted` for `scoutedByMe`/`scoutCount` and renders a consensus view in team detail.

**Tech Stack:** Convex (queries/mutations, convex-test), Vite + React 19, vitest, Tailwind.

## Global Constraints

- Do NOT delete or rewrite existing users or pitReports rows. The only schema change is an added index. (Spec: "No destructive migration.")
- Run tests with `npm test` (vitest run) from the repo root. Typecheck with `npm run typecheck`.
- Do NOT run `npm run e2e` without asking the user first — it wipes and reseeds the dev Convex database.
- Follow existing code style: Convex functions use object syntax with `args`/`returns` validators; frontend uses the existing shadcn/Tailwind idioms.
- Spec: `docs/superpowers/specs/2026-07-30-per-scout-reports-design.md`.

---

### Task 1: Per-scout upsert in `pitReports.submit`

**Files:**
- Modify: `convex/schema.ts` (pitReports indexes, ~line 66)
- Modify: `convex/pitReports.ts` (`submit`, ~lines 62-79)
- Test: `convex/tests/reports.test.ts` (replace the first `describe("pitReports.submit")` test)

**Interfaces:**
- Produces: `pitReports` table invariant "one report per (teamId, scoutId)", index `by_team_scout ["teamId", "scoutId"]`. Later tasks rely on both.

- [ ] **Step 1: Replace the obsolete submit test with two failing tests**

In `convex/tests/reports.test.ts`, replace the entire `describe("pitReports.submit", ...)` block (the "upserts by teamId" test) with:

```ts
describe("pitReports.submit", () => {
  test("scouts do not overwrite each other; resubmit replaces only the caller's report", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const firstScout = await createUser(t, "scout");
    const secondScout = await createUser(t, "scout");

    await t.withIdentity({ subject: firstScout }).mutation(api.pitReports.submit, {
      teamId,
      canScoreBalls: true,
      canClimb: false,
      storageCapacity: 3,
      driverRating: 2,
      defenseRating: 1,
      tags: ["Tippy"],
      notes: "Slow but steady",
    });
    await t.withIdentity({ subject: secondScout }).mutation(api.pitReports.submit, {
      teamId,
      canScoreBalls: false,
      canClimb: true,
      driverRating: 5,
      defenseRating: 4,
      tags: ["Fast"],
    });

    const reports = await t.run((ctx) =>
      ctx.db
        .query("pitReports")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect(),
    );
    expect(reports).toHaveLength(2);
    expect(new Set(reports.map((r) => r.scoutId))).toEqual(new Set([firstScout, secondScout]));

    // Resubmit by the first scout replaces their report only. Omitted optional
    // fields (storageCapacity, notes) must not survive from their first submit.
    await t.withIdentity({ subject: firstScout }).mutation(api.pitReports.submit, {
      teamId,
      canScoreBalls: true,
      canClimb: true,
      driverRating: 3,
      defenseRating: 3,
      tags: [],
    });

    const after = await t.run((ctx) =>
      ctx.db
        .query("pitReports")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect(),
    );
    expect(after).toHaveLength(2);
    const firstReport = after.find((r) => r.scoutId === firstScout);
    const secondReport = after.find((r) => r.scoutId === secondScout);
    expect(firstReport?.driverRating).toBe(3);
    expect(firstReport?.storageCapacity).toBeUndefined();
    expect(firstReport?.notes).toBeUndefined();
    expect(secondReport?.driverRating).toBe(5);
  });
});
```

Note: this removes the old test's `getForTeam` assertions; `getMine` gets its own test in Task 3.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- reports`
Expected: FAIL — `expect(reports).toHaveLength(2)` receives 1 (current code replaces by team).

- [ ] **Step 3: Add the index and change the upsert key**

In `convex/schema.ts`, add the index to `pitReports`:

```ts
    .index("by_team", ["teamId"])
    .index("by_team_scout", ["teamId", "scoutId"])
    .index("by_event", ["eventId"]),
```

In `convex/pitReports.ts`, change `submit`'s handler to look up by (team, scout):

```ts
  handler: async (ctx, { teamId, ...fields }) => {
    const user = await requireUser(ctx);
    const team = await ctx.db.get(teamId);
    if (!team) throw new ConvexError("Team not found");

    const existing = await ctx.db
      .query("pitReports")
      .withIndex("by_team_scout", (q) => q.eq("teamId", teamId).eq("scoutId", user._id))
      .unique();
    const doc = { eventId: team.eventId, teamId, scoutId: user._id, ...fields };
    if (existing) {
      await ctx.db.replace(existing._id, doc);
    } else {
      await ctx.db.insert("pitReports", doc);
    }
    return null;
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- reports`
Expected: PASS (all tests in reports.test.ts).

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/pitReports.ts convex/tests/reports.test.ts
git commit -m "feat: pit reports upsert per (team, scout)"
```

---

### Task 2: Pure aggregation function

**Files:**
- Create: `convex/lib/pitAggregate.ts`
- Test: `convex/tests/pitAggregate.test.ts`

**Interfaces:**
- Consumes: the `pitReports` doc shape from `convex/schema.ts`.
- Produces: `aggregatePitReports(reports: Doc<"pitReports">[]): PitAggregate | null` where:

```ts
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
```

- [ ] **Step 1: Write the failing test**

Create `convex/tests/pitAggregate.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { aggregatePitReports } from "../lib/pitAggregate";

let nextId = 0;
function report(overrides: Partial<Doc<"pitReports">>): Doc<"pitReports"> {
  nextId++;
  return {
    _id: `report${nextId}` as Id<"pitReports">,
    _creationTime: nextId,
    eventId: "event1" as Id<"events">,
    teamId: "team1" as Id<"teams">,
    scoutId: `scout${nextId}` as Id<"users">,
    canScoreBalls: false,
    canClimb: false,
    driverRating: 3,
    defenseRating: 3,
    tags: [],
    ...overrides,
  };
}

describe("aggregatePitReports", () => {
  test("returns null for no reports", () => {
    expect(aggregatePitReports([])).toBeNull();
  });

  test("averages numbers, counts booleans, takes mode of enums", () => {
    const agg = aggregatePitReports([
      report({
        canScoreBalls: true,
        canClimb: true,
        ballsPerMatch: 4,
        storageCapacity: 2,
        driverRating: 5,
        defenseRating: 2,
        hasAuto: true,
        autoSide: "left",
        autoDepth: "close",
        autoBalls: 2,
        autoClimb: true,
      }),
      report({
        canScoreBalls: true,
        canClimb: false,
        ballsPerMatch: 5,
        driverRating: 2,
        defenseRating: 3,
        hasAuto: true,
        autoSide: "left",
        autoDepth: "middle",
        autoBalls: 1,
        autoClimb: false,
      }),
      report({ canScoreBalls: false, canClimb: false, driverRating: 4, defenseRating: 4 }),
    ]);

    expect(agg).not.toBeNull();
    expect(agg!.scoutCount).toBe(3);
    expect(agg!.canScoreBalls).toEqual({ yes: 2, total: 3 });
    expect(agg!.canClimb).toEqual({ yes: 1, total: 3 });
    expect(agg!.hasAuto).toEqual({ yes: 2, total: 3 });
    expect(agg!.autoClimb).toEqual({ yes: 1, total: 2 });
    expect(agg!.ballsPerMatch).toBe(4.5); // mean of 4, 5 — third report didn't set it
    expect(agg!.storageCapacity).toBe(2); // only one report set it
    expect(agg!.autoBalls).toBe(1.5);
    expect(agg!.driverRating).toBeCloseTo(3.7); // mean of 5, 2, 4 = 3.666… → 3.7
    expect(agg!.defenseRating).toBe(3);
    expect(agg!.autoSide).toEqual({ value: "left", count: 2 });
    expect(agg!.autoDepth).toEqual({ value: "close", count: 1 }); // tie broken by option order
  });

  test("unions tags with counts and collects notes and latest photo", () => {
    const agg = aggregatePitReports([
      report({
        scoutId: "scoutA" as Id<"users">,
        tags: ["Fast", "Tippy"],
        notes: "note A",
        photoId: "photoOld" as Id<"_storage">,
        _creationTime: 1,
      }),
      report({
        scoutId: "scoutB" as Id<"users">,
        tags: ["Fast"],
        photoId: "photoNew" as Id<"_storage">,
        _creationTime: 2,
      }),
      report({ scoutId: "scoutC" as Id<"users">, notes: "note C", _creationTime: 3 }),
    ]);

    expect(agg!.tags).toEqual([
      { tag: "Fast", count: 2 },
      { tag: "Tippy", count: 1 },
    ]);
    expect(agg!.notes).toEqual([
      { scoutId: "scoutA", note: "note A" },
      { scoutId: "scoutC", note: "note C" },
    ]);
    expect(agg!.photoId).toBe("photoNew");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- pitAggregate`
Expected: FAIL — cannot resolve `../lib/pitAggregate`.

- [ ] **Step 3: Implement**

Create `convex/lib/pitAggregate.ts`:

```ts
import type { Doc, Id } from "../_generated/dataModel";

export type BoolCount = { yes: number; total: number };
export type PitAggregate = {
  scoutCount: number;
  canScoreBalls: BoolCount;
  canClimb: BoolCount;
  hasAuto: BoolCount;
  autoClimb: BoolCount;
  storageCapacity: number | null;
  ballsPerMatch: number | null;
  autoBalls: number | null;
  driverRating: number | null;
  defenseRating: number | null;
  autoSide: { value: "left" | "middle" | "right"; count: number } | null;
  autoDepth: { value: "close" | "middle"; count: number } | null;
  tags: { tag: string; count: number }[];
  notes: { scoutId: Id<"users">; note: string }[];
  photoId: Id<"_storage"> | null;
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
function mode<T extends string>(values: T[], order: readonly T[]): { value: T; count: number } | null {
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
    autoClimb: { yes: autoReports.filter((r) => r.autoClimb === true).length, total: autoReports.length },
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- pitAggregate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/pitAggregate.ts convex/tests/pitAggregate.test.ts
git commit -m "feat: pure pit report aggregation (means, counts, mode, tags)"
```

---

### Task 3: Backend queries — `getMine`, `aggregateForTeam`, mean-based stats, team status fields

**Files:**
- Modify: `convex/pitReports.ts` (add `getMine` and `aggregateForTeam`; keep `getForTeam` for now — team-detail still uses it until Task 5)
- Modify: `convex/stats.ts` (`statsForEvent`)
- Modify: `convex/teams.ts` (`listWithStatus`)
- Test: `convex/tests/reports.test.ts`, `convex/tests/teams.test.ts`

**Interfaces:**
- Consumes: `by_team_scout` index (Task 1), `aggregatePitReports` (Task 2).
- Produces:
  - `api.pitReports.getMine({ teamId })` → the caller's report with `photoUrl: string | null`, or `null`.
  - `api.pitReports.aggregateForTeam({ teamId })` → `PitAggregate` shape with `notes: { scoutName: string; note: string }[]` (names resolved, fallback `"Scout"`) and `photoUrl: string | null` instead of `photoId`; `null` when no reports.
  - `api.stats.forEvent` / `forTeam` → unchanged shape; `ballsPerMatch` is now the mean across a team's reports.
  - `api.teams.listWithStatus` → entries have `scoutedByMe: boolean` and `scoutCount: number` instead of `pitScouted`.

- [ ] **Step 1: Write the failing tests**

In `convex/tests/reports.test.ts`, append:

```ts
describe("pitReports.getMine and aggregateForTeam", () => {
  test("getMine returns only the caller's report", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scoutA = await createUser(t, "scout");
    const scoutB = await createUser(t, "scout");

    await submitPit(t, scoutA, teamId, 4);

    const mine = await t.withIdentity({ subject: scoutA }).query(api.pitReports.getMine, { teamId });
    expect(mine?.scoutId).toBe(scoutA);
    expect(mine?.ballsPerMatch).toBe(4);
    expect(mine?.photoUrl).toBeNull();

    const theirs = await t.withIdentity({ subject: scoutB }).query(api.pitReports.getMine, { teamId });
    expect(theirs).toBeNull();
  });

  test("aggregateForTeam averages across scouts and resolves note names", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const scoutA = await createUser(t, "scout");
    const scoutB = await createUser(t, "scout");
    await t.run((ctx) => ctx.db.patch(scoutA, { name: "Alice" }));

    await t.withIdentity({ subject: scoutA }).mutation(api.pitReports.submit, {
      teamId,
      canScoreBalls: true,
      canClimb: true,
      ballsPerMatch: 4,
      driverRating: 5,
      defenseRating: 2,
      tags: ["Fast"],
      notes: "solid",
    });
    await t.withIdentity({ subject: scoutB }).mutation(api.pitReports.submit, {
      teamId,
      canScoreBalls: true,
      canClimb: false,
      ballsPerMatch: 5,
      driverRating: 2,
      defenseRating: 3,
      tags: ["Fast", "Tippy"],
    });

    const agg = await t
      .withIdentity({ subject: scoutA })
      .query(api.pitReports.aggregateForTeam, { teamId });
    expect(agg?.scoutCount).toBe(2);
    expect(agg?.canClimb).toEqual({ yes: 1, total: 2 });
    expect(agg?.ballsPerMatch).toBe(4.5);
    expect(agg?.driverRating).toBe(3.5);
    expect(agg?.tags).toEqual([
      { tag: "Fast", count: 2 },
      { tag: "Tippy", count: 1 },
    ]);
    expect(agg?.notes).toEqual([{ scoutName: "Alice", note: "solid" }]);
    expect(agg?.photoUrl).toBeNull();

    const empty = await t
      .withIdentity({ subject: scoutA })
      .query(api.pitReports.aggregateForTeam, { teamId: await createTeam(t, eventId, 200) });
    expect(empty).toBeNull();
  });
});

describe("stats use the mean across scouts", () => {
  test("ballsPerMatch and benchmark use per-team means", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const teamId = await createTeam(t, eventId, 100);
    const benchmarkTeamId = await createTeam(t, eventId, BENCHMARK_TEAM);
    const scoutA = await createUser(t, "scout");
    const scoutB = await createUser(t, "scout");

    await submitPit(t, scoutA, teamId, 4);
    await submitPit(t, scoutB, teamId, 6); // mean 5
    await submitPit(t, scoutA, benchmarkTeamId, 10);
    await submitPit(t, scoutB, benchmarkTeamId, 30); // mean 20

    const all = await t.withIdentity({ subject: scoutA }).query(api.stats.forEvent, {});
    expect(all[teamId].ballsPerMatch).toBe(5);
    expect(all[teamId].pctOfBenchmark).toBeCloseTo(25);
    expect(all[benchmarkTeamId].pctOfBenchmark).toBeCloseTo(100);
  });
});
```

In `convex/tests/teams.test.ts`, in the `teams.listWithStatus` test: add a second report for `scoutedTeamId` by `adminId` inside the existing `t.run` block (copy the `pitReports` insert, change `scoutId` to `adminId`), then replace the `pitScouted` assertions:

```ts
    expect(scoutScouted?.scoutedByMe).toBe(true);
    expect(scoutScouted?.scoutCount).toBe(2);
    // ...
    expect(scoutUnscouted?.scoutedByMe).toBe(false);
    expect(scoutUnscouted?.scoutCount).toBe(0);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- reports teams`
Expected: FAIL — `api.pitReports.getMine` / `aggregateForTeam` do not exist; `scoutedByMe` undefined.

- [ ] **Step 3: Implement the backend changes**

In `convex/pitReports.ts`, add below `getForTeam` (import `aggregatePitReports` from `./lib/pitAggregate`):

```ts
export const getMine = query({
  args: { teamId: v.id("teams") },
  returns: v.union(pitReportValidator.extend({ photoUrl: v.union(v.string(), v.null()) }), v.null()),
  handler: async (ctx, { teamId }) => {
    const user = await requireUser(ctx);
    const report = await ctx.db
      .query("pitReports")
      .withIndex("by_team_scout", (q) => q.eq("teamId", teamId).eq("scoutId", user._id))
      .unique();
    if (!report) return null;
    const photoUrl = report.photoId ? await ctx.storage.getUrl(report.photoId) : null;
    return { ...report, photoUrl };
  },
});

const boolCountValidator = v.object({ yes: v.number(), total: v.number() });
const meanValidator = v.union(v.number(), v.null());

export const aggregateForTeam = query({
  args: { teamId: v.id("teams") },
  returns: v.union(
    v.object({
      scoutCount: v.number(),
      canScoreBalls: boolCountValidator,
      canClimb: boolCountValidator,
      hasAuto: boolCountValidator,
      autoClimb: boolCountValidator,
      storageCapacity: meanValidator,
      ballsPerMatch: meanValidator,
      autoBalls: meanValidator,
      driverRating: meanValidator,
      defenseRating: meanValidator,
      autoSide: v.union(
        v.object({
          value: v.union(v.literal("left"), v.literal("middle"), v.literal("right")),
          count: v.number(),
        }),
        v.null(),
      ),
      autoDepth: v.union(
        v.object({
          value: v.union(v.literal("close"), v.literal("middle")),
          count: v.number(),
        }),
        v.null(),
      ),
      tags: v.array(v.object({ tag: v.string(), count: v.number() })),
      notes: v.array(v.object({ scoutName: v.string(), note: v.string() })),
      photoUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { teamId }) => {
    await requireUser(ctx);
    const reports = await ctx.db
      .query("pitReports")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const agg = aggregatePitReports(reports);
    if (!agg) return null;
    const { photoId, notes, ...rest } = agg;
    return {
      ...rest,
      notes: await Promise.all(
        notes.map(async ({ scoutId, note }) => {
          const scout = await ctx.db.get(scoutId);
          return { scoutName: scout?.name ?? "Scout", note };
        }),
      ),
      photoUrl: photoId ? await ctx.storage.getUrl(photoId) : null,
    };
  },
});
```

In `convex/stats.ts`, replace the body of `statsForEvent` after the `reports` fetch:

```ts
  const ballsByTeam = new Map<Id<"teams">, number[]>();
  for (const report of reports) {
    if (report.ballsPerMatch === undefined) continue;
    const values = ballsByTeam.get(report.teamId);
    if (values) values.push(report.ballsPerMatch);
    else ballsByTeam.set(report.teamId, [report.ballsPerMatch]);
  }
  const meanFor = (teamId: Id<"teams">) => {
    const values = ballsByTeam.get(teamId);
    if (!values) return null;
    return Math.round((values.reduce((sum, x) => sum + x, 0) / values.length) * 10) / 10;
  };

  const benchmarkTeam = await ctx.db
    .query("teams")
    .withIndex("by_event_number", (q) => q.eq("eventId", eventId).eq("number", BENCHMARK_TEAM))
    .first();
  const benchmarkBalls = benchmarkTeam ? meanFor(benchmarkTeam._id) : null;

  const result: Record<string, { ballsPerMatch: number; pctOfBenchmark: number | null }> = {};
  for (const teamId of ballsByTeam.keys()) {
    const balls = meanFor(teamId);
    if (balls === null) continue;
    result[teamId] = { ballsPerMatch: balls, pctOfBenchmark: benchmarkPct(balls, benchmarkBalls) };
  }
  return result;
```

In `convex/teams.ts` `listWithStatus`: change the validator fields `pitScouted: v.boolean()` to `scoutedByMe: v.boolean(), scoutCount: v.number()`; replace the `pitScoutedTeamIds` computation and the mapped fields:

```ts
    const scoutCountByTeam = new Map<string, number>();
    const myScoutedTeamIds = new Set<string>();
    for (const report of pitReports) {
      scoutCountByTeam.set(report.teamId, (scoutCountByTeam.get(report.teamId) ?? 0) + 1);
      if (report.scoutId === user._id) myScoutedTeamIds.add(report.teamId);
    }
```

and in the returned map:

```ts
      scoutedByMe: myScoutedTeamIds.has(team._id),
      scoutCount: scoutCountByTeam.get(team._id) ?? 0,
```

- [ ] **Step 4: Run all convex tests**

Run: `npm test`
Expected: PASS. (Frontend still compiles: `getForTeam` and its call sites are untouched in this task; `pitScouted` consumers break typecheck only if `npm run typecheck` runs — it will, in Task 4. Do not run typecheck here.)

Note: `npm test` runs frontend vitest suites too if any exist; all must pass.

- [ ] **Step 5: Commit**

```bash
git add convex/pitReports.ts convex/stats.ts convex/teams.ts convex/tests/reports.test.ts convex/tests/teams.test.ts
git commit -m "feat: crowd-aggregate queries, mean-based stats, per-scout team status"
```

---

### Task 4: Frontend wiring — scout grid, form, status consumers

**Files:**
- Modify: `src/routes/scout.tsx` (grid check + count)
- Modify: `src/routes/scout-form.tsx:175` (`getForTeam` → `getMine`)
- Modify: `src/routes/home.tsx:19` (`pitScouted` → `scoutCount > 0`)
- Modify: `src/routes/teams.tsx:79` (badge)
- Modify: `src/components/picklist/robot-tinder.tsx:69` (`!current.pitScouted` → `current.scoutCount === 0`)
- Modify: `src/components/team-detail.tsx` (`PitStatusBadge` takes a count; line 77 usage)

**Interfaces:**
- Consumes: `api.pitReports.getMine`, `teams.listWithStatus`'s `scoutedByMe`/`scoutCount` (Task 3).
- Produces: `PitStatusBadge({ count }: { count: number })` — renders "N scout(s)" when count > 0, "Not Scouted" otherwise. Task 5 keeps using it.

- [ ] **Step 1: Make the changes**

`src/routes/scout-form.tsx` line 175: `api.pitReports.getForTeam` → `api.pitReports.getMine`. (The form now prefills from the caller's own report; all field prefill code is unchanged.)

`src/routes/scout.tsx` — in the team card, replace the `team.pitScouted` check block with:

```tsx
          {team.scoutedByMe && (
            <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-green-600 text-white">
              <CheckIcon className="size-3.5" />
            </span>
          )}
          {team.scoutCount > 0 && (
            <span className="absolute top-2 left-2 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
              {team.scoutCount}
            </span>
          )}
```

`src/components/team-detail.tsx` — change `PitStatusBadge` to:

```tsx
export function PitStatusBadge({ count }: { count: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        count > 0 ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-muted text-muted-foreground',
      )}
    >
      {count > 0 ? `${count} scout${count === 1 ? '' : 's'}` : 'Not Scouted'}
    </span>
  )
}
```

and update its usage at line 77 to `<PitStatusBadge count={team.scoutCount} />`.

`src/routes/teams.tsx` line 79: `<PitStatusBadge scouted={team.pitScouted} />` → `<PitStatusBadge count={team.scoutCount} />`.

`src/routes/home.tsx` line 19: `t.pitScouted` → `t.scoutCount > 0`.

`src/components/picklist/robot-tinder.tsx` line 69: `!current.pitScouted` → `current.scoutCount === 0`.

- [ ] **Step 2: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: typecheck FAILS only if a `pitScouted` consumer was missed — grep `pitScouted` under `src/` must return nothing. Tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/scout.tsx src/routes/scout-form.tsx src/routes/home.tsx src/routes/teams.tsx src/components/team-detail.tsx src/components/picklist/robot-tinder.tsx
git commit -m "feat: per-scout status in scout grid and team lists"
```

---

### Task 5: Team detail consensus view; delete `getForTeam`

**Files:**
- Modify: `src/components/team-detail.tsx` (`TeamDetailBody`, ~lines 61-159)
- Modify: `convex/pitReports.ts` (delete the `getForTeam` query)
- Test: `convex/tests/reports.test.ts` (remove any lingering `getForTeam` references — after Task 1 there should be none; verify)

**Interfaces:**
- Consumes: `api.pitReports.aggregateForTeam` (Task 3), `PitStatusBadge({ count })` (Task 4).

- [ ] **Step 1: Rewrite the pit section of `TeamDetailBody`**

Replace the `pitReport` query (line 63) with:

```tsx
  const agg = useQuery(api.pitReports.aggregateForTeam, { teamId: team._id })
```

Add a small helper next to `Stat` (same file):

```tsx
function BoolRow({ label, yes, total }: { label: string; yes: number; total: number }) {
  return (
    <span>
      {yes}/{total} say {label}
    </span>
  )
}
```

Replace the entire "Pit scouting" `<section>` (the `pitReport === undefined ? ... : ...` block) with:

```tsx
          <section className="space-y-2">
            <h3 className="text-sm font-medium">
              Pit scouting{agg ? ` (${agg.scoutCount} scout${agg.scoutCount === 1 ? '' : 's'})` : ''}
            </h3>
            {agg === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : agg === null ? (
              <p className="text-sm text-muted-foreground">Not scouted yet.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {agg.photoUrl && (
                  <img
                    src={agg.photoUrl}
                    alt={`${team.nickname} robot`}
                    className="max-h-48 w-full rounded-md object-cover"
                  />
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <BoolRow label="scores balls" yes={agg.canScoreBalls.yes} total={agg.canScoreBalls.total} />
                  <BoolRow label="climbs" yes={agg.canClimb.yes} total={agg.canClimb.total} />
                  {agg.storageCapacity !== null && <span>Storage: {agg.storageCapacity}</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {agg.driverRating !== null && <span>Driver rating: {agg.driverRating}</span>}
                  {agg.defenseRating !== null && <span>Defense rating: {agg.defenseRating}</span>}
                </div>
                <p className="text-muted-foreground">
                  {agg.hasAuto.yes > 0
                    ? [
                        `Auto (${agg.hasAuto.yes}/${agg.hasAuto.total}): ${agg.autoBalls ?? 0} balls`,
                        agg.autoSide && `prefers ${agg.autoSide.value}/${agg.autoDepth?.value ?? 'close'}`,
                        agg.autoClimb.yes > 0 && `${agg.autoClimb.yes}/${agg.autoClimb.total} climb in auto`,
                      ]
                        .filter(Boolean)
                        .join(', ')
                    : 'No auto'}
                </p>
                {agg.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {agg.tags.map(({ tag, count }) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {tag}
                        {count > 1 && <span className="text-muted-foreground"> ×{count}</span>}
                      </span>
                    ))}
                  </div>
                )}
                {agg.notes.map(({ scoutName, note }, i) => (
                  <p key={i}>
                    <span className="font-medium">{scoutName}:</span> {note}
                  </p>
                ))}
              </div>
            )}
          </section>
```

- [ ] **Step 2: Delete `getForTeam` from `convex/pitReports.ts`**

Remove the whole `export const getForTeam = query({...})` block. Grep for `getForTeam` across the repo — expected: no matches.

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/team-detail.tsx convex/pitReports.ts
git commit -m "feat: consensus pit view in team detail; drop shared getForTeam"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Run the full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 2: E2E — ask first**

Ask the user whether it's OK to run `npm run e2e` (it wipes and reseeds the dev Convex database). Only run it after a yes. If yes and it fails on `pitScouted`-era assertions, update the e2e specs to the new `scoutedByMe`/`scoutCount` fields and badge copy ("N scouts" / "Not Scouted").

- [ ] **Step 3: Report**

Summarize what changed and note that existing users and reports were untouched (index-only schema change).
