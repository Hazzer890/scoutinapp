# scoutinapp — agent notes

Install everything and run the full dev stack (Convex backend + Vite frontend):

```sh
bun run go
```

Stack: Bun, Vite, React 19, TypeScript strict, React Router 7 (SPA, library mode — router in `src/router.tsx`), Tailwind CSS v4 (no tailwind.config — CSS-first in `src/index.css`), shadcn/ui on Base UI (base-nova style, `src/components/ui/`), Convex (backend + auth, `convex/`), Zustand for ephemeral UI state only (`src/stores/ui.ts`), next-themes (class-based), Sonner toasts.

Rules:
- Convex is the source of truth for domain data. Never mirror Convex query data into Zustand.
- Use `bun` / `bunx` / `bun run` for everything. Scripts: `dev`, `dev:backend`, `dev:all`, `build`, `typecheck`, `lint`.
- Auth is Convex Auth (password provider). Deployment env vars (JWT_PRIVATE_KEY, JWKS, SITE_URL) are already set on dev deployment `dynamic-dinosaur-630` (team harry-c). `.env.local` holds CONVEX_DEPLOYMENT and VITE_CONVEX_URL.
- Add shadcn components with `bunx shadcn@latest add <name>` (Base UI implementation is configured in components.json).
- Convex functions must declare `args` and `returns` validators.
