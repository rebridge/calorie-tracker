# Tasks — v1 tracer bullets

Each task is a thin, end-to-end slice through every layer it touches (shared → DB → API → UI → container), so the app is runnable and demoable after every task. Build them in order; later tasks assume earlier ones are done.

| # | Task | Depends on | Demo after it's done |
|---|---|---|---|
| 01 | [Walking skeleton](01-walking-skeleton.md) | — | Container runs; phone loads the app shell over LAN/tailnet; `/api/health` is green |
| 02 | [Log a meal (happy path)](02-log-a-meal.md) | 01 | Type "2 eggs and coffee", see items + kcal saved under the right meal |
| 03 | [Logging failures & feedback](03-logging-failures.md) | 02 | "hello" → toast, text kept; API errors → 502 toast; spinner + skeleton while waiting |
| 04 | [Edit & delete items/entries](04-edit-delete-entries.md) | 02 | Tap item → drawer → edit/delete; change meal type; delete entry |
| 05 | [Settings & goals](05-settings-goals.md) | 01 | Set goals in Settings; they persist across restarts |
| 06 | [Day view for today](06-day-view-today.md) | 04, 05 | Day tab shows Remaining, Eaten/Goal, macro bars, today's meals |
| 07 | [Calories burned](07-calories-burned.md) | 06 | + Burned adds to the budget; burns listed and editable on Day view |
| 08 | [Daily weight](08-daily-weight.md) | 06 | + Weight logs today's weight; weight card shows/edits/deletes it |
| 09 | [Day navigation & past days](09-day-navigation.md) | 06, 07, 08 | ‹ › / calendar / swipe through history; read & edit past days |
| 10 | [Backdating (add to past days)](10-backdating.md) | 09 | Add a meal, burn or weight to last Monday from its Day view |
| 11 | [Weight trend chart](11-weight-trend-chart.md) | 08, 09 | 30d/90d/1y chart with 7-day moving average, viewed date marked |
| 12 | [Deploy hardening & docs](12-deploy-hardening.md) | all | Fresh clone → `.env` → `docker compose up` → working, backed-up app |

Conventions for every task:
- Shared Zod schemas live in `/shared`; the server validates requests with them and the web app infers its types from them.
- Any mutation invalidates the TanStack Query key for the affected date (`['day', date]`).
- UI targets a ~390px viewport, ≥44px tap targets, and follows the system light/dark theme.
- "Today" is always computed on the server from `TZ`, never sent by the client.
