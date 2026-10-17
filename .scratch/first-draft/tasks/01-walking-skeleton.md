# 01 — Walking skeleton

**Depends on:** nothing
**Spec refs:** §2 Architecture, §3 (settings table only), §5 `/api/health`, §6 shell, §7 Deployment

## Goal
Prove the entire pipeline before writing any features. A single container serves both a React shell and a Hono API. It opens a SQLite DB on a mounted volume, runs migrations on startup, and can be reached from a phone.

## Scope

**Repo / tooling**
- Monorepo with `/web`, `/server`, `/shared` (npm/pnpm workspaces), TypeScript everywhere, shared `tsconfig` base.
- Dev scripts: Vite dev server proxies `/api` to the Hono dev server.

**Server**
- Hono app on port 8080 that serves `/api/*` and the built `web/dist` (SPA fallback to `index.html` for client routes).
- `GET /api/health` returns `{ ok: true }` once the DB is open.
- better-sqlite3 + Drizzle that opens `DATABASE_PATH` with WAL mode on and runs migrations on startup.
- First migration creates the `settings` table and seeds row `id = 1` with the default goals (2000 / 150 / 200 / 65).
- Fail fast at startup if `ANTHROPIC_API_KEY` is missing (log clearly; don't crash-loop silently).
- A `today()` helper that returns `YYYY-MM-DD` in the container `TZ`, unit tested.

**Web**
- Vite + React 18 + TS + Tailwind + shadcn/ui initialised. TanStack Query provider and React Router set up.
- App shell: header with gear icon (→ `/settings`) and a bottom tab bar with **Log** (`/`) and **Day** (`/day`). Pages are placeholders for now.
- Safe-area insets, a mobile viewport meta tag, and system light/dark theme.
- The Log placeholder calls `/api/health` and shows the status, which proves the full round trip.

**Container**
- Multi-stage `Dockerfile`: build web + server, then a `node:22-slim` runtime as a non-root user with `EXPOSE 8080`.
- `docker-compose.yml` exactly as in §7 (volume `./data:/data`, `TZ`, healthcheck).
- `.env.example` with `ANTHROPIC_API_KEY=`; `.env` and `data/` gitignored.

## Acceptance criteria
- [ ] `docker compose up --build` runs and the container reports **healthy**.
- [ ] `http://<server-ip>:8080` on a phone shows the shell, the tab bar and a green health indicator.
- [ ] `./data/calories.db` exists on the host, with a seeded `settings` row; after a rebuild the data is still there.
- [ ] Deep-linking to `/day` or `/settings` and refreshing doesn't 404.
- [ ] The container runs as non-root.

## Out of scope
Any feature data (entries, burns, weights), Claude calls, styling beyond the shell.
