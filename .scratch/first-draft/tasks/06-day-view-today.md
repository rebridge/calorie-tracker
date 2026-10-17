# 06 — Day view (today)

**Depends on:** 04, 05
**Spec refs:** §5 `GET /api/day/:date`, §6 Day (header card, macros, meals)

## Goal
Stand up the Day page for **today only**: how much budget is left and how the macros are tracking against goals. Navigation to other days comes in task 09.

## Scope

**Server**
- Extend `GET /api/day/:date` to include `goals` (current settings) and `totals: { eaten_kcal, burned_kcal, protein_g, carbs_g, fat_g }`. `burned_kcal` is 0 until task 07, and `weight` is `null` until task 08. Lock in the final response shape now so later tasks only fill it in.

**Web**
- `/day` route (and `/day/:date?` param wired but only `today` used for now).
- Header card: large **Remaining = goal − eaten + burned**, with Eaten / Burned / Goal shown below it. Negative remaining is shown distinctly (over budget).
- Macro progress bars for protein, carbs and fat (grams vs goal); the bar caps visually at 100% but the label shows the real number.
- Meals section: the same `MealLog` component, with all task 04 edit actions working.
- The Day page also gets the shared `Composer` (it saves to today here).
- Query key `['day', date]` so the Log and Day pages share the cache.

## Acceptance criteria
- [ ] Log a meal on the Log tab, switch to Day: the totals and remaining already reflect it without a manual refresh.
- [ ] Editing an item on the Day page updates the header card and macro bars.
- [ ] Changing goals in Settings updates the Day header.
- [ ] Remaining math is covered by a unit test (including the over-budget case).

## Out of scope
Burns (07), weight (08), date navigation and past days (09).
