# 07 — Calories burned

**Depends on:** 06
**Spec refs:** §3 burns, §5 `/api/burns`, §6 Log quick actions, Day burned list

## Goal
Manual burn entries that add to the day's budget (`goal − eaten + burned`).

## Scope

**Shared**
- `POST /api/burns` body `{ calories: positive int, note?: string, date?: YYYY-MM-DD }`; `PATCH` body is a partial `{ calories, note }`.

**DB**
- Migration for the `burns` table (index on `local_date`).

**Server**
- `POST /api/burns`: `date` defaults to `today()`; a future date returns **400**. Sets `created_at` to now.
- `PATCH /api/burns/:id`, `DELETE /api/burns/:id` (404 if missing). Responses include `local_date`.
- `GET /api/day/:date` now returns `burns[]` and a real `totals.burned_kcal`.

**Web**
- **+ Burned** chip above the composer (Log and Day pages) opens a drawer with a numeric kcal input (`inputmode="decimal"`), an optional note and Save.
- Day view **Burned** list: each burn shows kcal and note. Tapping one opens a drawer to edit kcal/note, or delete it.
- Invalidate `['day', local_date]` on every mutation.

## Acceptance criteria
- [ ] Add a 300 kcal burn → Burned shows 300 and Remaining goes up by 300.
- [ ] Edit and delete a burn → the totals update.
- [ ] `POST /api/burns` with tomorrow's date → 400.
- [ ] Burns are omitted from the meal groups (they're a separate list).

## Out of scope
Activity-type calculators or health-app sync.
