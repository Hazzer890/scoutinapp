# Task 10 report — Pick list kanban + consensus merge UI

Branch: `worktree-agent-a570cf710b3f802d7`

## What was built

### `src/components/kanban/team-card.tsx`
Presentational card + shared types (`TeamWithStatus`, `TeamStats` derived from
`FunctionReturnType`). Shows team number, nickname, pit badge (reuses `PitStatusBadge` from
`team-detail.tsx`), and three metrics: avg balls, accuracy %, and throughput as % of 4788 —
falling back to raw balls/sec when `throughputPctOfBenchmark` is null. A team absent from the
`api.stats.forEvent` record renders "No match data". Grip icon for drag affordance; `overlay`
variant (rotate + ring + shadow) used by the drag overlay, `dragging` variant (40% opacity) for
the in-place placeholder.

### `src/components/kanban/board.tsx`
`DndContext` + one `SortableContext` per column. Columns: S / A / B / C / D / Do Not Pick /
Uncategorized, derived on every render from the live `entries` + `teams` queries — no query data
is mirrored into state. Only `activeId` and `overColumn` (transient drag state) live in local
`useState`; the Zustand store was left untouched since nothing outside the board needs that state.

- Column bodies are `useDroppable`, so empty columns accept drops.
- S column header shows a "2 max" pill that turns purple when full; a cross-column drop into a
  full S column is rejected client-side with a toast before the mutation fires.
- Rank math: same-column moves pass the index of the hovered card within the column (matches the
  server's remove-then-splice = `arrayMove` semantics); cross-column moves pass hovered index +1
  when the pointer is past the card's midpoint, or `length` when dropped on column background.
  Uncategorized drops send `tier: null`; reordering *within* Uncategorized is a no-op (it is
  sorted by team number) and skips the mutation entirely.
- Sensors: `MouseSensor` (5px distance), `TouchSensor` (250ms long-press, 8px tolerance) and
  `KeyboardSensor`. The long-press touch constraint is deliberate: with a plain `PointerSensor` +
  `touch-action: none` the columns become unscrollable on a phone, since every touch target is a
  card.
- `DragOverlay` with `dropAnimation={null}` carries the card; the source keeps its slot at 40%
  opacity, so nothing reflows mid-drag. The hovered column gets a primary ring/tint as the drop
  indicator; within a column, dnd-kit's sortable transforms open the real gap.
- Board is a `h-[calc(100svh-14rem)] min-h-96` horizontal snap-scroller; columns `w-64` on mobile
  (fits 375px), `w-72` from `sm`, each scrolling its own card list so headers stay pinned.
- `readOnly` disables every sortable and droppable, so the per-scout viewer uses the same render
  path with no separate layout.

### `src/components/merge-dialog.tsx`
`mergePreview` is queried only while the dialog is open (`'skip'` otherwise). Preview table:
team number + nickname, tier badge, score to 2dp, list count. Two-step apply — "Apply to primary"
reveals a destructive callout ("This overwrites the primary list with N teams. Any manual edits to
the primary list are lost.", plus an explicit "no scout lists exist, so the primary list will be
emptied" line when `listCount === 0`) and only the second button calls `applyMerge`. Success and
failure both toast; the confirm step resets on close.

### `src/routes/picklist.tsx`
Keeps `export function PicklistPage`, wrapped in `AuthLoading` / `Unauthenticated` /
`Authenticated` like `home.tsx`. Scouts see only their board. Admins get Base UI Tabs
(My list / Primary / Scouts), a scout `Select` that appears in the Scouts tab (defaults to the
first list without an effect), and a Merge button. `getPrimary` / `listAll` are `'skip'`ped for
non-admins. Scope passed to `moveEntry` is `primary` only on the Primary tab. Server errors are
toasted, with "S tier is full" special-cased for the race where a third S entry slips past the
client check. The board is keyed by view so drag state resets when switching tabs/scouts.

`package.json` / `bun.lock`: added `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`,
`@dnd-kit/utilities@3.2.2`. Nothing else touched — no router, no other routes, no `convex/`.

## Verification

`bun run typecheck && bun run build && bun run lint` all pass; the only lint output is the two
pre-existing `only-export-components` warnings in `ui/button.tsx` and `ui/tabs.tsx`.

## Concerns

1. **No live drag verification.** Exercising the board needs a signed-in session against the dev
   Convex deployment, and I am not permitted to enter credentials (nor to run any convex CLI
   command). The rank arithmetic was verified by hand against `moveEntry`'s remove-then-splice
   implementation for same-column up/down, cross-column above/below/append, and empty-column
   drops, but a human should still drag a card S↔A and reload to confirm persistence.
2. **Two runtime behaviours typecheck can't prove:** Base UI `Tabs` used without any `Tabs.Panel`
   (as a segmented control), and `Select` receiving `value={null}` when no scout list exists. Both
   are supported per the installed type definitions, but neither is covered by a test — the repo
   has no jsdom/testing-library setup and adding one was out of scope for this task's dependency
   allowance.
3. **Cross-column drop preview is a column highlight, not an insertion gap.** Getting a real gap
   requires mirroring the lists into local state and shuffling them in `onDragOver`, which
   conflicts with "Convex is the source of truth" and risks flicker when the query lands. The
   overlay + column ring reads clearly; revisit only if the gap is explicitly wanted.
4. **Uncategorized ordering is by team number and not persisted** (those teams have no entry).
   Dragging inside that column intentionally does nothing.

## Review fixes (round 1)

1. **MEDIUM — same-column background drop no-oped** (`board.tsx`). The `overIndex === -1` early
   return conflated "dropped on the column background" with the Uncategorized case. Now only
   Uncategorized returns early; a background drop in a tier column sends
   `rank = target.length - 1` (the last index after the server removes the entry, so the card
   lands at the end). The existing equality guard against the card's current index still
   suppresses the redundant mutation when it was already last.
2. **LOW — scouts tab flashed "No scout has started a pick list yet."** (`picklist.tsx`). `entries`
   defaults to `[]` in that view, so the loading guard never fired. Added
   `(readOnly && scoutLists === undefined)` to the loading condition.
3. **LOW — read-only cards announced as draggable** (`board.tsx`). `useSortable`'s `attributes`
   (role=button, "press space to pick up" description) were spread even when disabled. The spread
   is now gated on `!readOnly`; `listeners` are already `undefined` when disabled.

`bun run typecheck && bun run build && bun run lint` re-run clean — same two pre-existing
`only-export-components` warnings, nothing new.
