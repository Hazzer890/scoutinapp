# scoutinapp

Vite + React 19 + TypeScript (strict) SPA with React Router 7, Tailwind CSS v4, shadcn/ui (Base UI, base-nova), Convex (data + auth), Zustand (ephemeral UI state), next-themes, and Sonner.

## Run

```sh
bun run go        # install deps + start Convex dev and Vite together
```

Individual scripts:

- `bun run dev` — Vite only
- `bun run dev:backend` — Convex dev only
- `bun run dev:all` — both, via concurrently
- `bun run build` / `bun run typecheck` / `bun run lint`

## Scouting export API

Read-only JSON dump of one event's scouting data, served from the Convex HTTP
domain (`.convex.site`, not the `.convex.cloud` used by the app):

```sh
curl "https://<deployment>.convex.site/api/scouting"              # active event
curl "https://<deployment>.convex.site/api/scouting?event=2026xx" # by TBA key
```

Returns `{ exportedAt, event, teams, matches, pitReports, picklists }`. Rows that
reference a team also carry its number, so consumers don't have to join on
Convex ids. Missing or unknown event → `404` with an `error` message.

Scouts are **pseudonymous**: no names, emails or user ids: each is `"Scout 1"`,
`"Scout 2"`, … in the `scout` field on a report and `owner` on a picklist. The
label is per-scout and stable across calls, so you can still group a scout's
reports and line a personal picklist up with its author — you just can't tell who
they are. A scout filing their first report is appended to the numbering rather
than renumbering everyone.

**This endpoint is public** — no API key, CORS open to `*`. Anyone with the
deployment URL can read your reports, notes, photo URLs, and picklists. Two things
pseudonymity does not cover: notes are passed through verbatim, so a scout who
signs one has named themselves, and a reader who knows the event can still guess
who "Scout 3" is from which teams they scouted. To lock the endpoint down, check a
shared secret against a `Bearer` header in `scoutingExport` (`convex/http.ts`)
before running the query.

## Layout

- `convex/` — schema, auth (Convex Auth, password provider), functions. Source of truth for domain data.
- `convex/exportData.ts` + `convex/http.ts` — the public scouting export API above
- `src/routes/` — React Router 7 routes (`root.tsx` layout, `home.tsx`, `sign-in.tsx`)
- `src/stores/ui.ts` — Zustand, client-only UI state (never mirror Convex data here)
- `src/components/ui/` — shadcn components (Base UI implementation)
