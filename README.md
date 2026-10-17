# Calorie Counter

Self-hosted, single-user calorie tracker for phones. See [`.scratch/first-draft/SPEC.md`](.scratch/first-draft/SPEC.md) for the full spec and [`tasks/`](.scratch/first-draft/tasks/README.md) for the build plan.

## Run with Docker

```sh
cp .env.example .env          # then set ANTHROPIC_API_KEY
mkdir -p data && sudo chown 1000:1000 data   # the container runs as uid 1000
docker compose up -d --build
```

Open `http://<server-ip>:8080`. For HTTPS over the tailnet, run `tailscale serve --bg 8080` on the host.

If `./data` doesn't exist, Docker creates it owned by root. The container can't write to it then, and the logs tell you to run the `chown` above.

## Develop

```sh
npm install
npm run dev     # Vite on :5173 (proxies /api) + Hono on :8080
npm test
npm run typecheck
```

In dev the database is `./data/calories.db` and the server reads `.env` from the repo root.

| Path | What |
|---|---|
| `web/` | Vite + React 18 + Tailwind + shadcn/ui |
| `server/` | Hono API, Drizzle schema + migrations (`server/drizzle/`), runs migrations on startup |
| `shared/` | Zod schemas shared by web and server |

After changing `server/src/db/schema.ts`, run `npm run db:generate -w server` to create a migration.
