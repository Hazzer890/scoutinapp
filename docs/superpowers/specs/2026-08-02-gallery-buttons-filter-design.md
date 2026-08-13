# Photo gallery, bigger icon buttons, scouted filters

Date: 2026-08-02
Status: approved

## Problem

Three small UI updates: robot photos are only visible one team at a time in team detail; icon buttons are below mobile touch-target size; team lists cannot be narrowed to scouted/unscouted.

## 1. Bigger icon buttons (app-wide)

In `src/components/ui/button.tsx` bump the icon size variants: `icon` size-8 → size-10, `icon-sm` size-7 → size-9, `icon-xs` size-6 → size-8. Remove the `size-6 shrink-0` className overrides on the three admin edit-name buttons in `src/components/admin/user-roles.tsx` so they inherit the variant. No other call-site changes.

## 2. Scouted/unscouted filter

Three-chip segmented control, styled like the scout form's segmented rows:

- `/scout`: All / To scout / Scouted — filters on `scoutedByMe` (personal to-do).
- `/teams`: All / Scouted / Unscouted — filters on `scoutCount > 0` (coverage), composed with the existing search (AND).

Client-side `useState`, default All, no backend changes, no URL persistence.

## 3. Photo gallery page

New query `pitReports.photosForEvent` (no args, `requireUser`): active-event reports that have a `photoId` → `[{ teamId, teamNumber, nickname, photoUrl }]` sorted by team number (a team appears once per scout photo). No active event → `[]`. Reports whose storage URL resolves to null are skipped.

New route `/gallery` (`src/routes/gallery.tsx`), auth-gated like other pages: responsive grid of photos, team number + nickname overlaid at the bottom of each tile, tile links to `/teams?team=<teamId>`. Empty state: "No robot photos yet." Nav: "Gallery" link in the Browse card of `card-nav.tsx`; quick link on home.

## Testing

Convex test for `photosForEvent`: excludes photo-less reports, sorts by team number, returns [] with no active event. Buttons and filters are covered by typecheck + existing suites; filter logic is trivial client state.
