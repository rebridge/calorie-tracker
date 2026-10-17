# 09 — Day navigation & viewing past days

**Depends on:** 06, 07, 08
**Spec refs:** §6 Day (date bar, empty state, caching, goals on past days), §5 future-date 400s

## Goal
Step back through history and view or edit any previous day's meals, burns and weight. Adding *new* data to past days comes in task 10.

## Scope

**Server**
- `GET /api/day/:date` returns **400** for a future date or a malformed date.
- Past days use the *current* goals (no goal history).

**Web**
- `/day/:date?` route: no param means today. Navigating to today's date normalises to `/day`.
- Date bar:
  - `‹` / `›` step one day; `›` is disabled on today.
  - The label reads "Today", "Yesterday" or "Mon, Oct 13".
  - Tapping the label opens a shadcn `Calendar` in a `Popover`, with dates after today disabled.
- Horizontal swipe on the page body steps between days (it mustn't trigger while scrolling vertically or inside drawers/inputs).
- Empty state: a past day with no data shows "Nothing logged" with the totals at zero.
- All edit/delete actions from tasks 04, 07 and 08 work on the viewed date and invalidate that date's query.
- TanStack Query caches per date, so stepping back and forth doesn't refetch (set a sensible `staleTime`). Optionally prefetch the adjacent day.
- "Today" on the client comes from the server's response (e.g. `GET /api/day/today` returns the resolved `date`), so the client and server agree near midnight.

## Acceptance criteria
- [ ] ‹ goes to yesterday, and the label reads "Yesterday"; › comes back to "Today" and is then disabled.
- [ ] Picking a date three weeks ago in the calendar shows that day; future dates can't be picked.
- [ ] Swiping left/right changes the day on a real phone.
- [ ] Editing an item on a past day updates that day's totals and leaves today's alone.
- [ ] Manually visiting `/day/<tomorrow>` shows an error state (the API returns 400), not a blank page.

## Out of scope
The composer and chips on past days writing to that date (10).
