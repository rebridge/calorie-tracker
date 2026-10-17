# 12 — Deploy hardening & docs

**Depends on:** all previous tasks
**Spec refs:** §7 Deployment, §6 general UI requirements

## Goal
Make the app something you can run for months: reproducible deploys, safe backups, tailnet HTTPS, and a final mobile polish pass.

## Scope

**Container / ops**
- Verify the image size is reasonable. Production deps only in the runtime stage (better-sqlite3 native build works on `node:22-slim`).
- Graceful shutdown: close the DB on SIGTERM so WAL checkpoints cleanly.
- Make sure the `/data` volume permissions work for the non-root user on a fresh host (document `chown` if needed).
- Healthcheck confirmed in `docker compose ps`.

**Docs (`README.md`)**
- Setup: clone → `cp .env.example .env` → set the key → `docker compose up -d --build`.
- LAN URL; tailnet HTTPS via `tailscale serve --bg 8080`.
- Backup: copy `calories.db` with `-wal`/`-shm` together, or `sqlite3 calories.db ".backup out.db"`. Include a sample cron line.
- Changing `TZ`, and what it affects (the day boundary).
- Local dev workflow.

**UI polish pass**
- Audit every interactive element for ≥44px tap targets and safe-area padding (notch and home indicator), especially the pinned composer and tab bar while the keyboard is open on iOS.
- Light/dark theme check on every screen.
- Loading and error states for every query (no blank screens).

## Acceptance criteria
- [ ] A fresh clone on a clean host reaches a working app by following only the README.
- [ ] The app works over `https://<host>.<tailnet>.ts.net` on a phone.
- [ ] Backup → delete `data/` → restore → all history is back.
- [ ] `docker compose restart` loses no data, including writes made in the seconds before it.

## Out of scope
PWA install, CSV/JSON export, auth.
