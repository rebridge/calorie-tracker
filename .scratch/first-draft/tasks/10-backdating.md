# 10 — Backdating (add to any past day)

**Depends on:** 09
**Spec refs:** §4 user message for past dates & meal-type fallback, §5 `date` params, §6 "Adding to any day"

## Goal
Anything submitted from a Day view is saved to *that* date. Backdated entries are distinguishable by `created_at`, and the meal type can be chosen explicitly because the time-of-day fallback doesn't apply.

## Scope

**Server**
- `POST /api/entries` honours `date` (defaults to today; future → **400**). `local_date = date` and `created_at = now`.
- Claude user message for a past date: `Logging for a past day (Mon, Oct 13)\n\n<text>` (no local time).
- Meal-type resolution: request `meal_type` → Claude's → **snack** for past days (time-of-day fallback only for today). Extend the unit tests.

**Web**
- `Composer` takes a `date` prop and sends it.
  - On a past day the placeholder is *"Add to Mon, Oct 13…"*.
  - On a past day, Breakfast / Lunch / Dinner / Snack chips appear above the input. None is selected by default; tapping toggles one, and the selected chip is sent as `meal_type`.
- The **+ Burned** and **+ Weight** chips on the Day view send the viewed date (`POST /api/burns { date }`, `PUT /api/weights/:date`).
- After a successful submit, invalidate `['day', date]`. Also invalidate the weights range queries if a weight was added (task 11).

## Acceptance criteria
- [ ] On last Monday's Day view, "chicken burrito" with Lunch selected → saved with `local_date` = that Monday, `meal_type = lunch` and `created_at` = now.
- [ ] Same with no chip and no meal in the text → saved as snack.
- [ ] Burns and weights added from a past day land on that day.
- [ ] The Log tab and the Day view for today behave exactly as before (no chips; time-of-day fallback).
- [ ] The prompt sent to Claude for past days contains no local time.

## Out of scope
Parsing dates out of text ("yesterday's dinner…"), moving entries between dates.
