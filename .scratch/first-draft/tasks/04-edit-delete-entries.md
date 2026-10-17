# 04 — Edit & delete items and entries

**Depends on:** 02
**Spec refs:** §3 `edited` flag, §5 items/entries PATCH/DELETE, §6 Log (item row, drawer, overflow menu)

## Goal
Auto-save only works if the result can be fixed afterwards. Make every part of a logged meal correctable from the shared `MealLog`, which means it will work on any date once the Day view exists.

## Scope

**Shared**
- `PATCH /api/items/:id` body: partial `{ name, portion, calories, protein_g, carbs_g, fat_g }` (non-negative numbers).
- `PATCH /api/entries/:id` body: `{ meal_type }`.

**Server**
- `PATCH /api/items/:id`: update the fields and set `edited = true`. 404 if the item is missing.
- `DELETE /api/items/:id`: delete the item, and delete the parent entry if it was the last item (in one transaction).
- `PATCH /api/entries/:id`: change `meal_type`.
- `DELETE /api/entries/:id`: delete the entry; its items go via cascade.
- Every mutation response includes the affected `local_date` so the client knows which day query to invalidate.

**Web**
- Item row: an amber "low" badge on low-confidence items; tapping the badge shows the `assumption` in a popover.
- Tapping an item opens a bottom-sheet `Drawer` with every field editable (numeric inputs use `inputmode="decimal"`), plus Save and Delete.
- Entry overflow menu (`DropdownMenu`) with **Change meal type** (submenu or drawer) and **Delete entry** (with confirm).
- Show edited items with a subtle "edited" marker.
- After any mutation, invalidate `['day', local_date]`.

## Acceptance criteria
- [ ] Edit an item's kcal → the entry, meal and day totals update; the item is marked edited in the DB.
- [ ] Deleting the last item of an entry removes the whole card.
- [ ] Moving an entry from Snack to Lunch moves the card into the Lunch group.
- [ ] Delete entry removes it and its items (no orphan `entry_items` rows).
- [ ] Every control is ≥44px and usable one-handed on a 390px screen.

## Out of scope
Moving an entry to a different date (v1 non-goal).
