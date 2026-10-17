# 02 — Log a meal (happy path)

**Depends on:** 01
**Spec refs:** §3 entries / entry_items, §4 Claude integration, §5 `POST /api/entries`, `GET /api/day/:date`, §6 Log

## Goal
The core loop, done thinly: type a meal and Claude parses it. The result is auto-saved and appears in today's log under the right meal. Only the happy path is covered here; failure handling is task 03.

## Scope

**Shared**
- `MealSchema` (Claude output schema, exactly as in §4).
- Request schema for `POST /api/entries`: `{ text: string (non-empty), date?: string, meal_type?: MealType }`. Only `text` is used in this task.
- Response types: `Entry`, `EntryItem`, and a `DayResponse` with entries grouped by meal plus totals.

**DB**
- Migration for `entries` and `entry_items` (FK with cascade delete, index on `entries.local_date`).

**Server**
- Claude client module:
  - `client.messages.parse()`, `model: "claude-haiku-5-5"`, `max_tokens: 4000`, `output_config: { effort: "medium", format: zodOutputFormat(MealSchema) }`.
  - Fixed system prompt from §4.
  - User message for today: `Local time: HH:MM\n\n<text>`.
- Meal-type resolution: request `meal_type` → Claude's `meal_type` → time-of-day fallback (<10:30 breakfast, 10:30–14:30 lunch, 14:30–17:00 snack, 17:00–21:00 dinner, later snack). Pure function, unit tested at the boundaries.
- `POST /api/entries`: call Claude, then insert the entry and its items in one transaction. Store `raw_text`, `model`, the full `model_response` JSON and the token counts; `local_date = today()`. Returns the entry with its items.
- `GET /api/day/:date` (supports `today` and `YYYY-MM-DD`): entries + items grouped Breakfast → Lunch → Dinner → Snack, with per-meal and per-entry kcal subtotals and day totals (kcal, P, C, F) computed by query. Goals, burns and weight can be stubbed or omitted for now.

**Web**
- Shared `Composer` component: an auto-growing shadcn `Textarea` plus a send button, pinned to the bottom. Placeholder "What did you eat?". Enter inserts a newline; ⌘/Ctrl+Enter submits.
- Shared `MealLog` component: meal groups with kcal subtotals; entry card with the meal type, raw text (muted), items and entry total; item row with name, portion, kcal and a small `P/C/F` line.
- Log page = `MealLog` for today + `Composer`. On success, clear the input and invalidate `['day', today]`.

## Acceptance criteria
- [ ] "2 eggs in a wrap with black coffee for breakfast" → a card under Breakfast with ~3 items, kcal and macros.
- [ ] With no meal mentioned, the meal type follows the time-of-day fallback.
- [ ] The DB row has `raw_text`, `model_response`, token counts, `local_date`, and `created_at` as an ISO timestamp.
- [ ] Reloading the page shows the same log (it's persisted, not just client state).
- [ ] The API key never shows up in any browser network response or the JS bundle.

## Out of scope
Non-food/refusal/error handling, spinners/skeletons (03), editing (04), past dates (10).
