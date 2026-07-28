# Task 9: Match scouting landing + form

## Status
Complete.

## Files changed
- `src/routes/matches.tsx` — replaced placeholder. Landing page: manual entry (match-number `Stepper` + shadcn team `Select` + Go button, disabled until a team is chosen), and a schedule list (from `api.matches.list`, already sorted ascending by `matchNumber` via the `by_event_match` index) rendered as expandable cards — Q# + local `HH:mm` time when present, red/blue alliance numbers in red/blue text. Tapping a card expands 3 red + 3 blue team buttons linking to `/matches/:matchNumber/:teamNumber`, passing `matchId` via router `state`.
- `src/routes/match-form.tsx` — replaced placeholder. Resolves team by number via `api.teams.list` (friendly "No team #N found" state if missing) and match by number via `api.matches.list` (falls back to `matchId` from location state, e.g. for manual entry where the match may not exist in the schedule). Big `Stepper`s for balls scored/missed/max balls held (single column on mobile, 3-col from `sm:`), toggle cards for Attempted climb (reveals Climb succeeded only when on; forces `climbSucceeded: false` in the submit payload whenever `climbAttempted` is false, regardless of stale local state) and Played defense, tag chips (`PRESET_TAGS` from `convex/lib/constants` + free-form add via `Input`+Enter/Add), optional notes `Textarea`, sticky full-width Submit that calls `api.matchReports.submit`, shows a sonner `toast.success('Match report saved')`, and navigates back to `/matches`.

No other files touched (router.tsx, other routes, convex/ untouched). Reused the existing `src/components/stepper.tsx` — did not duplicate it.

## Verification
- `bun install` — 421 packages, clean.
- `bun run typecheck` — passes, no errors.
- `bun run build` — passes (tsc -b && vite build).
- `bun run lint` — only the 2 pre-existing `react(only-export-components)` warnings in `src/components/ui/button.tsx` and `tabs.tsx`; nothing new.

## Concerns
- Did not run a live Playwright 375px flow: this worktree has no `.env.local` / `VITE_CONVEX_URL`, and per the assignment I must never run the Convex CLI to stand one up. `ConvexReactClient` throws at construction without a real deployment URL, so the app can't render end-to-end here. The concrete verification bar given in the assignment (typecheck/build/lint) passes cleanly; a real browser smoke test should be done wherever a live Convex dev deployment is reachable (e.g. after merge).
- `matches.list`'s sort-by-`matchNumber` guarantee relies on the `by_event_match` Convex index (`["eventId", "matchNumber"]`) rather than an explicit sort in the query handler — confirmed in `convex/schema.ts` and `convex/matches.ts`, not something this task's files control.

## Review fixes (round 2)

1. **Medium — tap targets under 44px.** Added `h-11` (44px) to the Go button, the six team buttons, and the tag chips; `h-12` on the sticky Submit. Files: `src/routes/matches.tsx`, `src/routes/match-form.tsx`.
2. **Low — disabled Go looked enabled / bad href when no team picked.** `matches.tsx`: when no team is selected, render a plain `disabled` `Button` (no `render`/`Link`); only wire the `Link` once a team is chosen, so there's no `/matches/1/` href and no reliance on `disabled:` variants that Base UI non-native buttons skip.
3. **Low — invalid match-number guard.** `match-form.tsx`: the invalid-param branch now also requires `Number.isInteger(matchNumber) && matchNumber > 0`, in addition to the existing `teamNumber` finiteness check.

Re-ran `bun run typecheck && bun run build && bun run lint` — all clean, same 2 pre-existing UI warnings only.
