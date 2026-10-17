# Calorie Counter — v1 Spec

A self-hosted, single-user calorie tracker designed for phones. You describe what you ate in plain language. Claude Haiku 5.5 breaks it into items with calories and macros, and the results are saved to a SQLite database on the server.

## 1. Goals & non-goals

**v1 goals**
- Fast text entry, e.g. "2 eggs in a wrap with black coffee for breakfast". The phone keyboard's dictation counts as text entry.
- Auto-save Claude's estimate as soon as it returns, and allow editing or deleting it afterwards.
- A "Day" view with calories eaten, calories burned, macros against goals, and a weight trend. It opens on today and can step back to any previous day.
- View, edit and add to any previous day's entries, burns and weight (backdating).
- One container, one data volume, reachable over the LAN and the tailnet.

**Out of scope for v1** (deliberately deferred)
- Accounts and auth. The tailnet and home network are the access boundary.
- Multiple users or profiles.
- BMR/TDEE calculation and health-app or smart-scale sync.
- Moving an existing entry to a different date, recents/favorites, and PWA install.
- Parsing dates out of the text ("yesterday's dinner was…"). The date always comes from the day being viewed.
- Fiber, sugar and sodium.
- CSV/JSON export (back up the volume instead).
- Clarifying follow-up questions from the model.

## 2. Architecture

```
Phone browser ──HTTPS (tailscale serve)──▶ host:8080
                                            │
                              ┌─────────────┴─────────────┐
                              │  app container (Node 22)  │
                              │  ├─ Hono API  /api/*      │
                              │  └─ static React build /  │
                              │        │                  │
                              │   better-sqlite3 ─▶ /data/calories.db (volume)
                              │        │                  │
                              │   @anthropic-ai/sdk ──────┼──▶ Claude API
                              └───────────────────────────┘
```

- **One container.** The Node server serves both the API and the built frontend's static files, so there's no CORS and a single port.
- **The database lives outside the frontend's lifecycle.** It's a SQLite file on a mounted volume, so it survives container rebuilds and restarts.
- **The API key stays server-side**, read from `ANTHROPIC_API_KEY`. It is never sent to the browser.

### Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React 18 + TypeScript, Tailwind, shadcn/ui |
| Charts | shadcn `chart` component (Recharts) |
| Data fetching | TanStack Query |
| Routing | React Router (3 routes) |
| Backend | Node 22 + Hono + TypeScript |
| DB | SQLite via `better-sqlite3` + Drizzle ORM (migrations run on startup) |
| Validation | Zod (shared by the API and the Claude output schema) |
| LLM | `@anthropic-ai/sdk`, model `claude-haiku-5-5` |

### Repo layout

```
/web        React app
/server     Hono API, DB schema, Claude client
/shared     Zod schemas + types shared by web and server
Dockerfile  multi-stage: build web + server → slim runtime image
docker-compose.yml
```

## 3. Data model

All weights are in **lb**. The day boundary uses the container's `TZ`.

```
settings          (single row, id = 1)
  calorie_goal      int      default 2000
  protein_goal_g    int      default 150
  carbs_goal_g      int      default 200
  fat_goal_g        int      default 65

entries           one per submission
  id                int pk
  created_at        text     ISO timestamp
  local_date        text     YYYY-MM-DD (TZ-local, indexed)
  meal_type         text     breakfast | lunch | dinner | snack
  raw_text          text     exactly what the user typed
  model             text     e.g. claude-haiku-5-5
  model_response    text     full JSON response (audit trail)
  input_tokens      int
  output_tokens     int

entry_items       parsed food items
  id                int pk
  entry_id          int fk → entries (cascade delete)
  name              text     "Scrambled eggs"
  portion           text     "2 large eggs"
  calories          int
  protein_g         real
  carbs_g           real
  fat_g             real
  confidence        text     high | medium | low
  assumption        text?    "Assumed 10-inch flour tortilla"
  edited            bool     true once the user changes any field

burns             manual calories-burned entries
  id                int pk
  local_date        text
  calories          int
  note              text?    "evening run"
  created_at        text

weights           at most one per day (a new entry for the same day replaces the old one)
  local_date        text pk
  weight_lb         real
  created_at        text
```

Day totals are computed by query, never stored.

## 4. Claude integration

**Request** (one call per submission):

- `model: "claude-haiku-5-5"`
- `output_config: { effort: "medium", format: zodOutputFormat(MealSchema) }`. Medium is already Haiku 5.5's default, but the spec sets it explicitly. Thinking is left at its default (adaptive).
- `max_tokens: 4000`
- Use `client.messages.parse()` from the TS SDK so the response is validated against the Zod schema.
- **System prompt** (fixed text): "You are a nutrition estimator. Break the user's description into individual food or drink items. Use standard US nutrition data. When a portion is vague, assume a typical serving, state the assumption, and lower the confidence. Only set meal_type if the user says it."
- **User message:** the raw text plus some context.
  - For today, the context is the current local time, e.g. `Local time: 08:14\n\n2 eggs in a wrap with black coffee for breakfast`.
  - For a past date, there's no time: `Logging for a past day (Mon, Oct 13)\n\n…`.

**Output schema:**

```ts
const MealSchema = z.object({
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).nullable(),
  items: z.array(z.object({
    name: z.string(),
    portion: z.string(),
    calories: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
    confidence: z.enum(["high", "medium", "low"]),
    assumption: z.string().nullable(),
  })),
  // set when the input isn't food ("hello", "ran 3 miles")
  not_food_reason: z.string().nullable(),
});
```

**Server-side handling**
- **Meal type:** if the request includes a `meal_type`, that wins. Otherwise Claude's `meal_type` is used.
  - If both are null and the entry is for today, the server assigns it from the time of day: before 10:30 is breakfast, 10:30–14:30 is lunch, 14:30–17:00 is a snack, 17:00–21:00 is dinner, and anything later is a snack.
  - If both are null and the entry is for a past day, it defaults to snack. It can be changed afterwards.
- **Dates:** an entry's `local_date` is the target date. `created_at` is always the real time it was logged, so backdated entries can be told apart.
- **Non-food input:** if `items` is empty or `not_food_reason` is set, nothing is saved. The API returns 422 with the reason, and the UI keeps the text in the input box.
- **Refusals and errors:** check `stop_reason`. A `refusal` or `max_tokens` stop, an API error, or a schema failure returns 502 and saves nothing. Haiku 5.5 has no server-side refusal fallback, and the SDK's default 2 retries cover 429 and 5xx responses.
- **Cost:** about 1–2K tokens per call at $0.10 / $0.50 per 1M tokens comes to a fraction of a cent per meal. Prompt caching isn't worth it because the system prompt is below the minimum cacheable size.

## 5. API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/entries` | `{ text, date?, meal_type? }` → calls Claude, saves the result, returns the entry and its items. `date` defaults to today; future dates return 400. |
| `GET` | `/api/day/:date` | `date` is `YYYY-MM-DD` or `today`. Returns that day's entries and items grouped by meal, burns, totals, goals, and that day's weight. A future date returns 400. |
| `PATCH` | `/api/items/:id` | Edit name, portion, calories or macros (sets `edited = true`) |
| `DELETE` | `/api/items/:id` | Delete one item (the entry is deleted when its last item goes) |
| `PATCH` | `/api/entries/:id` | Change `meal_type` |
| `DELETE` | `/api/entries/:id` | Delete a whole entry |
| `POST` | `/api/burns` | `{ calories, note?, date? }`. `date` defaults to today; future dates return 400. |
| `PATCH` | `/api/burns/:id` | Edit `calories` or `note` |
| `DELETE` | `/api/burns/:id` | Delete a burn entry |
| `PUT` | `/api/weights/:date` | `{ weight_lb }` (upsert). `date` is `YYYY-MM-DD` or `today`; future dates are rejected. |
| `DELETE` | `/api/weights/:date` | Delete that day's weight |
| `GET` | `/api/weights?range=30d\|90d\|1y` | Raw points plus a 7-day moving average |
| `GET`/`PUT` | `/api/settings` | Goals |
| `GET` | `/api/health` | For the container healthcheck |

Item, entry and burn edits are addressed by id, so they work the same on any date. The server takes "today" from `TZ`, never from the client.

## 6. UI (mobile-first)

Design for a viewport around 390px wide, with large tap targets (≥44px) and safe-area insets. A bottom tab bar holds **Log** and **Day**, and a gear icon in the header opens **Settings**. The app follows the system light/dark theme.

### Log (home)
- **Composer pinned to the bottom:** a shadcn `Textarea` that auto-grows, plus a send button. On mobile, Enter inserts a newline; ⌘/Ctrl+Enter submits on desktop. Placeholder: *"What did you eat?"*
- **While Claude is working:** the send button shows a spinner and a skeleton card appears in the log.
- **On success:** the input clears and a new card shows at the top of the meal group: meal type, raw text in muted style, the items, and the entry's total kcal.
- **On failure:** the text stays in the input and a toast shows the reason (not food / try again).
- **Today's log, grouped by meal** (Breakfast → Lunch → Dinner → Snack), each group showing its kcal subtotal. This list is a shared `MealLog` component that the Day view reuses.
  - **Item row:** name, portion, kcal, and a small `P/C/F` line. Low-confidence items get an amber badge, and tapping the badge shows the assumption.
  - **Tapping an item** opens a bottom-sheet `Drawer` where every field can be edited, along with a Delete button.
  - **The entry's overflow menu** offers Change meal type and Delete entry.
- **Quick actions** above the composer: **+ Burned** and **+ Weight** chips. Each opens a drawer with a numeric input (`inputmode="decimal"`).

### Day (`/day/:date?`; defaults to today)
- **Date bar at the top:** `‹` and `›` buttons step one day at a time. The label ("Today", "Yesterday", or "Mon, Oct 13") opens a shadcn `Calendar` in a popover to jump to any date. `›` and calendar dates after today are disabled. A horizontal swipe also steps between days.
- **Header card:** large **Remaining = goal − eaten + burned**, with Eaten / Burned / Goal shown below it.
- **Macro progress bars:** protein, carbs and fat in grams against their goals.
- **Meals:** the same `MealLog` component as the Log page, with the same edit drawer, meal-type change and delete actions. These work on any date.
- **Burned list:** that day's burn entries. Tap one to edit its calories or note, or delete it.
- **Weight card:** that day's weight, which can be edited or deleted. If that day has no weight, the card shows a prompt to log one. Below it is a line chart of raw points with a 7-day moving average line and a 30d / 90d / 1y toggle (30d by default). The chart always ends at today and marks the viewed date.
- **Empty state:** a past day with no data shows "Nothing logged" with the totals at zero.
- **Adding to any day:** every date gets the same composer and **+ Burned** / **+ Weight** chips as the Log page, using a shared `Composer` component with a `date` prop. Anything submitted is saved to the viewed date.
  - On a past day, the composer's placeholder reads *"Add to Mon, Oct 13…"*, so it's clear where the entry goes.
  - On a past day, the composer also shows Breakfast / Lunch / Dinner / Snack chips. None is selected by default, and a selected chip is sent as `meal_type`. This exists because the time-of-day fallback can't apply to past days.
  - **+ Weight** becomes **Edit weight** when that day already has a weight.
- **Goals on past days:** they're compared against the *current* goals. Goal history isn't stored.
- **Caching:** TanStack Query keys data by date, so stepping back and forth doesn't refetch, and any edit invalidates that date's query.

### Settings
- Calorie goal and P/C/F gram goals.
- Read-only info: the model in use and the DB path.

## 7. Deployment

**Dockerfile** (multi-stage):
1. Install dependencies and build `/web` (Vite) and `/server` (tsc).
2. Runtime stage `node:22-slim`: copy the server build, the web `dist`, and production dependencies. Run as a non-root user, `EXPOSE 8080`.

**docker-compose.yml**

```yaml
services:
  calories:
    build: .
    image: calorie-counter:latest
    restart: unless-stopped
    ports: ["8080:8080"]
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      TZ: America/New_York        # sets the day boundary
      DATABASE_PATH: /data/calories.db
    volumes:
      - ./data:/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:8080/api/health').then(r=>process.exit(r.ok?0:1))"]
      interval: 30s
```

- **Secrets:** put `ANTHROPIC_API_KEY` in a `.env` file next to the compose file. Commit a `.env.example`; the real `.env` is gitignored.
- **LAN access:** `http://<server-ip>:8080`
- **Tailnet access over HTTPS:** on the host, run `tailscale serve --bg 8080`, then open `https://<host>.<tailnet>.ts.net`.
- **Backup:** back up `./data/`. SQLite runs in WAL mode, so copy `calories.db`, `-wal` and `-shm` together, or run `sqlite3 calories.db ".backup out.db"`.

## 8. Decisions log

| Topic | Decision |
|---|---|
| Users | Single user, no auth |
| Stack | Node/TS + SQLite |
| Save flow | Auto-save, edit later |
| Calories burned | Manual number entry |
| Meal type | Inferred by Claude, with a time-of-day fallback |
| Goals | Calories + P/C/F grams |
| Weight | Manual, lb, 7-day moving average, 30d/90d/1y |
| Nutrients | Calories, protein, carbs, fat |
| Vague input | Assume a typical portion and flag low confidence |
| Audit | Store the raw text and the full model response |
| Backup | Volume only |
| API key | Env var |
| HTTPS | `tailscale serve` |
| Remaining calories | `goal − eaten + burned` (burned calories add to the budget) |
| Past days | View, edit, delete, and add entries, burns and weight on any past day; the date comes from the Day view, not from parsing the text |
| Extras | None beyond past-day view/edit/add in v1 |

## 9. Open questions (defaults in place; change if wrong)

1. **Default goals** are 2000 kcal, 150P / 200C / 65F. You'll likely set your own on first run.
