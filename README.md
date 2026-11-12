# Calorie Counter

Self-hosted, single-user calorie tracker for phones. Describe what you ate in plain English and Claude estimates calories and macros. See [`.scratch/first-draft/SPEC.md`](.scratch/first-draft/SPEC.md) for the full spec and [`tasks/`](.scratch/first-draft/tasks/README.md) for the build plan.

There is no login: anyone who can reach the port can read and edit your data. Keep it on your LAN or tailnet, never on the public internet.

## Run with Docker

You need Docker with Compose v2 and an [Anthropic API key](https://console.anthropic.com/).

```sh
git clone <this repo> calorie-tracker && cd calorie-tracker
cp .env.example .env                          # then set ANTHROPIC_API_KEY=... in .env
mkdir -p data && sudo chown 1000:1000 data    # the container runs as uid 1000 (user "node")
docker compose up -d --build
docker compose ps                             # wait for "healthy" (up to ~30s)
```

The port is published on `127.0.0.1` only, so open `http://localhost:8080` on the host and use Tailscale (below) from other devices. To use another port, set `CALORIES_PORT` in `.env`. To reach it directly from your LAN instead, set `CALORIES_BIND=0.0.0.0` in `.env`.

If `./data` doesn't exist, Docker creates it owned by root and the container can't write to it. It restarts in a loop and the logs (`docker compose logs`) say to run `sudo chown -R 1000:1000 ./data`.

### HTTPS over your tailnet

On the host (with [Tailscale](https://tailscale.com/) installed, and MagicDNS and HTTPS certificates enabled in the admin console):

```sh
tailscale serve --bg 8080
```

Then open `https://<host>.<tailnet>.ts.net` from any device on the tailnet. `tailscale serve status` shows the URL; `tailscale serve reset` removes it. Add the page to your phone's home screen for an app-like launch.

### Configuration

| Setting | Where | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env` | required; the server refuses to start without it |
| `TZ` | `.env` | `America/New_York` |
| `CALORIES_PORT` | `.env` | `8080` (host port; the container always listens on 8080 inside) |
| `CALORIES_BIND` | `.env` | `127.0.0.1` (host address; `0.0.0.0` for your LAN, or the host's Tailscale IP) |
| `DATABASE_PATH` | `docker-compose.yml` | `/data/calories.db` (the `./data` volume) |

After changing `.env`, run `docker compose up -d` to apply it. If you change `CALORIES_PORT`, use the same number in `tailscale serve`.

#### Changing `TZ`

Set `TZ=` in `.env` (an [IANA name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), e.g. `Europe/London`), then `docker compose up -d`. It sets:

- the day boundary: what counts as "today" for new entries, burns and weights, and for the Log and Day views;
- the clock used to guess the meal type (breakfast, lunch, dinner or snack) when you log something now.

Existing entries keep the date they were saved under, so changing `TZ` doesn't move them. Times on entry cards come from your phone's own time zone.

### Update

```sh
git pull && docker compose up -d --build
```

Migrations run on startup. Your data stays in `./data`.

### Logs and shutdown

`docker compose logs -f` shows startup (`[startup] ...`) and shutdown (`[shutdown] ...`). On `docker stop` / `restart` the server stops accepting requests, lets in-flight ones finish (up to 8s), folds the SQLite write-ahead log into `calories.db` and exits; compose allows 15s before killing it.

## Backup and restore

All data is the SQLite database in `./data/` (`calories.db`, plus `calories.db-wal` and `calories.db-shm` while the app runs, because it uses WAL mode).

**Backup** (safe while the app is running). Either:

- `mkdir -p backups && sqlite3 data/calories.db ".backup 'backups/calories-$(date +%F).db'"` on the host (needs the `sqlite3` package), or with nothing installed on the host:

  ```sh
  docker compose exec -T calories node -e "require('better-sqlite3')('/data/calories.db').backup('/data/backup.db').then(() => console.log('ok'))"
  ```

  which writes `./data/backup.db`; move it somewhere safe.
- Or stop the app and copy the whole `data/` directory. If you copy a running database by hand, copy `calories.db`, `calories.db-wal` and `calories.db-shm` together, or the copy can miss recent writes.

Sample cron line (daily at 03:30, keeping a copy per weekday; create `~/backups` first):

```cron
30 3 * * * sqlite3 /path/to/calorie-tracker/data/calories.db ".backup '$HOME/backups/calories-$(date +\%a).db'"
```

Copy those files off the machine (rsync, restic, etc.) for real protection.

**Restore**

```sh
docker compose down
rm -f data/calories.db data/calories.db-wal data/calories.db-shm   # stale -wal/-shm must not outlive the old db
cp ~/backups/calories-Mon.db data/calories.db
sudo chown -R 1000:1000 data
docker compose up -d
```

## Develop

Requires Node 22+.

```sh
npm install
cp .env.example .env    # set ANTHROPIC_API_KEY; the dev server reads .env from the repo root
npm run dev             # Vite on :5173 (proxies /api) + Hono on :8080
```

Open `http://localhost:5173` (or `http://<your-ip>:5173` from a phone on the same network). In dev the database is `./data/calories.db`.

```sh
npm test                # Vitest: server + shared
npm run typecheck
npm run build           # shared -> server (dist/) -> web (dist/)
```

To run the production build without Docker: `npm run build`, then `ANTHROPIC_API_KEY=... node server/dist/index.js` (serves the API and `web/dist` on :8080).

| Path | What |
|---|---|
| `web/` | Vite + React 18 + Tailwind + shadcn/ui |
| `server/` | Hono API, Drizzle schema + migrations (`server/drizzle/`), runs migrations on startup |
| `shared/` | Zod schemas shared by web and server |

After changing `server/src/db/schema.ts`, run `npm run db:generate -w server` to create a migration.
