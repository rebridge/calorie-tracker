# 08 — Daily weight

**Depends on:** 06
**Spec refs:** §3 weights, §5 `PUT`/`DELETE /api/weights/:date`, §6 Weight card, quick actions

## Goal
Log at most one weight (lb) per day, then view, edit and delete it from the Day view. The trend chart comes in task 11.

## Scope

**Shared**
- `PUT /api/weights/:date` body `{ weight_lb: positive number }`.
- `:date` accepts `YYYY-MM-DD` or `today`; a shared date-param parser rejects future dates (reused by `/api/day/:date`).

**DB**
- Migration for `weights` (`local_date` PK).

**Server**
- `PUT /api/weights/:date`: upsert, so a new entry for the same day replaces the old one (update `created_at`). A future date returns **400**.
- `DELETE /api/weights/:date` (404 if none).
- `GET /api/day/:date` includes `weight: { weight_lb, created_at } | null`.

**Web**
- **+ Weight** chip next to + Burned opens a drawer with a decimal input (`inputmode="decimal"`), prefilled if a weight exists. It's labelled **Edit weight** when the day already has one.
- Day view weight card: shows that day's weight with edit/delete, or a "Log today's weight" prompt when it's empty.

## Acceptance criteria
- [ ] Log 182.4 → the card shows 182.4 lb. Log 181.9 the same day → it replaces the old value (one row in the DB).
- [ ] Delete → the card shows the empty-state prompt and the chip reads "+ Weight" again.
- [ ] `PUT /api/weights/<tomorrow>` → 400.

## Out of scope
Trend chart and moving average (11), unit conversion (lb only), smart-scale sync.
