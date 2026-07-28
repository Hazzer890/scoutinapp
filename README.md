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

## Layout

- `convex/` — schema, auth (Convex Auth, password provider), functions. Source of truth for domain data.
- `src/routes/` — React Router 7 routes (`root.tsx` layout, `home.tsx`, `sign-in.tsx`)
- `src/stores/ui.ts` — Zustand, client-only UI state (never mirror Convex data here)
- `src/components/ui/` — shadcn components (Base UI implementation)
