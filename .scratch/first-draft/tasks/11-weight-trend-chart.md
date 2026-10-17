# 11 — Weight trend chart

**Depends on:** 08, 09
**Spec refs:** §5 `GET /api/weights`, §6 Weight card chart

## Goal
A weight trend under the weight card: raw points plus a 7-day moving average, over 30d / 90d / 1y. It always ends at today and marks the viewed date.

## Scope

**Server**
- `GET /api/weights?range=30d|90d|1y` (default 30d, invalid range → 400) returns:
  - `points: { date, weight_lb }[]`, from today − range through today
  - `moving_avg: { date, avg_lb }[]`, a 7-day trailing average. Define the gap handling and document it, e.g. the average of the readings within the trailing 7 calendar days, emitted only on days that have a reading. Compute it over a window that starts 6 days before the range so the first points have a full average.
- The moving-average function is pure and unit tested (gaps, single point, empty).

**Web**
- shadcn `chart` (Recharts) line chart with two series: raw points (dots/thin line) and the moving average (bold line).
- 30d / 90d / 1y toggle (`ToggleGroup`), 30d by default. Query key `['weights', range]`.
- X-axis always ends at today; a `ReferenceLine` marks the viewed date when it falls within the range.
- Works in light and dark themes; readable at 390px wide.
- Weight mutations (PUT/DELETE) invalidate `['weights', *]`.

## Acceptance criteria
- [ ] With ~10 weights over 3 weeks, the chart shows the raw points and a smoothed average line.
- [ ] Switching to 90d/1y refetches once, then is cached.
- [ ] Viewing a past Day shows a marker at that date on the chart.
- [ ] Editing that day's weight updates the chart immediately.
- [ ] An empty state when there are no weights in range.

## Out of scope
Goal weight lines, projections, unit conversion.
