# Gallery, Bigger Buttons, Scouted Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three UI updates — app-wide bigger icon buttons, scouted/unscouted filter chips on /scout and /teams, and a /gallery page of all robot photos.

**Architecture:** Button change is a variant-size bump in the shared `button.tsx`. Filters are client-side state with a small shared `FilterChips` component. Gallery is one Convex query (`pitReports.photosForEvent`) plus a grid route.

**Tech Stack:** Convex query + convex-test, React 19 + react-router 7 + Tailwind.

## Global Constraints

- Run tests with `npm test`, typecheck with `npm run typecheck`. Do NOT run `npm run e2e` without asking the user (wipes/reseeds dev Convex data).
- Convex functions declare `args`/`returns` validators and call `requireUser` first.
- Spec: `docs/superpowers/specs/2026-08-02-gallery-buttons-filter-design.md`.

---

### Task 1: Bigger icon buttons

**Files:**
- Modify: `src/components/ui/button.tsx:28-33` (icon size variants)
- Modify: `src/components/admin/user-roles.tsx` (drop `size-6 shrink-0` overrides, 3 places)

**Interfaces:**
- Produces: `size="icon"` → size-10, `size="icon-sm"` → size-9, `size="icon-xs"` → size-8, everywhere.

- [ ] **Step 1: Bump the variants**

In `src/components/ui/button.tsx` change the `size` variants:

```ts
        icon: "size-10",
        "icon-xs":
          "size-8 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-9 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
```

(leave `icon-lg` as is — it is now equal to icon-sm, unused distinction, not worth churn).

In `src/components/admin/user-roles.tsx`, remove `size-6 shrink-0` from the three edit-name buttons' `className` (keep `shrink-0`):
- `className="size-6 shrink-0"` → `className="shrink-0"` (Edit name, Save name, Cancel buttons).

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS. Grep `size-6 shrink-0` under `src/` — no matches.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/button.tsx src/components/admin/user-roles.tsx
git commit -m "feat: bigger icon buttons for touch targets"
```

---

### Task 2: Scouted/unscouted filter chips

**Files:**
- Create: `src/components/filter-chips.tsx`
- Modify: `src/routes/scout.tsx` (TeamGrid)
- Modify: `src/routes/teams.tsx` (TeamsList)

**Interfaces:**
- Produces: `FilterChips<T extends string>({ options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void })` — a horizontal chip row.

- [ ] **Step 1: Create the shared chips component**

`src/components/filter-chips.tsx`:

```tsx
import { cn } from '@/lib/utils'

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label="Filter" className="flex gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-9 rounded-full border px-3.5 text-sm font-medium transition-colors',
            value === option.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background hover:bg-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Wire /scout (filters on scoutedByMe)**

In `src/routes/scout.tsx`: add imports `import { useState } from 'react'` and `import { FilterChips } from '@/components/filter-chips'`. In `TeamGrid`, after the `teams` query:

```tsx
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all')
```

After the `teams.length === 0` early return, compute:

```tsx
  const filtered = teams.filter((t) =>
    filter === 'all' ? true : filter === 'done' ? t.scoutedByMe : !t.scoutedByMe,
  )
```

Wrap the returned grid in a fragment, chips above, and map over `filtered` instead of `teams`; show an empty message when the filter leaves nothing:

```tsx
  return (
    <div className="space-y-3">
      <FilterChips
        options={[
          { value: 'all', label: 'All' },
          { value: 'todo', label: 'To scout' },
          { value: 'done', label: 'Scouted' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {filtered.length === 0 ? (
        <p className="text-muted-foreground">No teams match this filter.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {/* existing team tiles, mapping over `filtered` */}
        </div>
      )}
    </div>
  )
```

- [ ] **Step 3: Wire /teams (filters on scoutCount > 0, ANDed with search)**

In `src/routes/teams.tsx`: same imports (`useState` already imported; add `FilterChips`). In `TeamsList` add:

```tsx
  const [filter, setFilter] = useState<'all' | 'scouted' | 'unscouted'>('all')
```

Extend the existing `filtered` memo to apply the chip filter after the search filter:

```tsx
  const filtered = useMemo(() => {
    if (!teams) return []
    const q = search.trim().toLowerCase()
    const bySearch = q
      ? teams.filter((t) => t.number.toString().includes(q) || t.nickname.toLowerCase().includes(q))
      : teams
    if (filter === 'all') return bySearch
    return bySearch.filter((t) => (filter === 'scouted' ? t.scoutCount > 0 : t.scoutCount === 0))
  }, [teams, search, filter])
```

Render the chips between the search `Input` and the list:

```tsx
      <FilterChips
        options={[
          { value: 'all', label: 'All' },
          { value: 'scouted', label: 'Scouted' },
          { value: 'unscouted', label: 'Unscouted' },
        ]}
        value={filter}
        onChange={setFilter}
      />
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/filter-chips.tsx src/routes/scout.tsx src/routes/teams.tsx
git commit -m "feat: scouted/unscouted filter chips on scout and teams pages"
```

---

### Task 3: Photo gallery

**Files:**
- Modify: `convex/pitReports.ts` (append `photosForEvent`)
- Create: `src/routes/gallery.tsx`
- Modify: `src/router.tsx`, `src/components/card-nav.tsx` (Browse card), `src/routes/home.tsx` (quickLinks)
- Test: `convex/tests/reports.test.ts`

**Interfaces:**
- Consumes: `getActiveEvent` (already imported in `pitReports.ts`), `by_event` index, existing test helpers (`createUser`, `createEvent`, `createTeam`).
- Produces: `api.pitReports.photosForEvent` (no args) → `{ teamId: Id<"teams">; teamNumber: number; nickname: string; photoUrl: string }[]` sorted by teamNumber asc.

- [ ] **Step 1: Write the failing test**

Append to `convex/tests/reports.test.ts`:

```ts
describe("pitReports.photosForEvent", () => {
  test("returns photo reports sorted by team number, skipping photo-less reports", async () => {
    const t = setupTest();
    const eventId = await createEvent(t);
    const team200 = await createTeam(t, eventId, 200);
    const team100 = await createTeam(t, eventId, 100);
    const scoutA = await createUser(t, "scout");
    const scoutB = await createUser(t, "scout");

    const [photoA, photoB] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["a"])),
      await ctx.storage.store(new Blob(["b"])),
    ]);

    await t.run(async (ctx) => {
      const base = {
        eventId,
        canScoreBalls: true,
        canClimb: false,
        driverRating: 3,
        defenseRating: 3,
        tags: [] as string[],
      };
      await ctx.db.insert("pitReports", { ...base, teamId: team200, scoutId: scoutA, photoId: photoA });
      await ctx.db.insert("pitReports", { ...base, teamId: team100, scoutId: scoutB, photoId: photoB });
      await ctx.db.insert("pitReports", { ...base, teamId: team100, scoutId: scoutA }); // no photo
    });

    const photos = await t.withIdentity({ subject: scoutA }).query(api.pitReports.photosForEvent, {});
    expect(photos.map((p) => p.teamNumber)).toEqual([100, 200]);
    expect(photos[0].nickname).toBe("Team 100");
    expect(photos[0].photoUrl).toContain("http");
  });

  test("returns [] when there is no active event", async () => {
    const t = setupTest();
    const scoutId = await createUser(t, "scout");
    const photos = await t.withIdentity({ subject: scoutId }).query(api.pitReports.photosForEvent, {});
    expect(photos).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- reports`
Expected: FAIL — `api.pitReports.photosForEvent` does not exist.

- [ ] **Step 3: Implement the query**

Append to `convex/pitReports.ts`:

```ts
export const photosForEvent = query({
  args: {},
  returns: v.array(
    v.object({
      teamId: v.id("teams"),
      teamNumber: v.number(),
      nickname: v.string(),
      photoUrl: v.string(),
    }),
  ),
  handler: async (ctx) => {
    await requireUser(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return [];
    const reports = await ctx.db
      .query("pitReports")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();

    const photos: { teamId: Id<"teams">; teamNumber: number; nickname: string; photoUrl: string }[] = [];
    for (const report of reports) {
      if (!report.photoId) continue;
      const team = await ctx.db.get(report.teamId);
      if (!team) continue;
      const photoUrl = await ctx.storage.getUrl(report.photoId);
      if (!photoUrl) continue;
      photos.push({ teamId: report.teamId, teamNumber: team.number, nickname: team.nickname, photoUrl });
    }
    photos.sort((a, b) => a.teamNumber - b.teamNumber);
    return photos;
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- reports`
Expected: PASS.

- [ ] **Step 5: Create the gallery page and nav**

`src/routes/gallery.tsx`:

```tsx
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { api } from '../../convex/_generated/api'

function Gallery() {
  const photos = useQuery(api.pitReports.photosForEvent)

  if (photos === undefined) {
    return <p className="text-muted-foreground">Loading…</p>
  }
  if (photos.length === 0) {
    return <p className="text-muted-foreground">No robot photos yet.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {photos.map((photo, i) => (
        <Link
          key={`${photo.teamId}-${i}`}
          to={`/teams?team=${photo.teamId}`}
          className="group relative aspect-square overflow-hidden rounded-lg border bg-card"
        >
          <img
            src={photo.photoUrl}
            alt={`${photo.nickname} robot`}
            loading="lazy"
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-xs font-medium text-white">
            <span className="text-sm font-semibold tabular-nums">{photo.teamNumber}</span>{' '}
            <span className="line-clamp-1 opacity-90">{photo.nickname}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}

export function GalleryPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Robot Gallery</h1>
      <AuthLoading>
        <p className="text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">
          Sign in to see robot photos.{' '}
          <Link to="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </Unauthenticated>
      <Authenticated>
        <Gallery />
      </Authenticated>
    </div>
  )
}
```

`src/router.tsx`: `import { GalleryPage } from '@/routes/gallery'`; after the `leaderboard` route add:

```tsx
      { path: 'gallery', Component: GalleryPage },
```

`src/components/card-nav.tsx`: in the Browse card's links add `{ to: '/gallery', label: 'Gallery' }`.

`src/routes/home.tsx`: in `quickLinks` add `{ to: '/gallery', label: 'Gallery' }`.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add convex/pitReports.ts convex/tests/reports.test.ts src/routes/gallery.tsx src/router.tsx src/components/card-nav.tsx src/routes/home.tsx
git commit -m "feat: robot photo gallery page"
```
