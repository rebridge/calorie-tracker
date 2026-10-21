import { addDays } from "@calorie-tracker/shared";

/** The trailing window: a day's average covers that day and the 6 days before it (7 calendar days). */
export const MOVING_AVG_DAYS = 7;

/**
 * Trailing 7-day moving average of daily weights.
 *
 * Gap rule: the window is calendar days, not readings. A day's average is the mean of every reading dated within
 * the 7 calendar days ending on it (that day and the 6 before), so a missed day doesn't stretch the window back
 * to older readings. An average is emitted only on days that have a reading (nothing is interpolated across a
 * gap), so a lone reading averages to itself and a reading after a week-long gap stands on its own.
 *
 * `readings` must be one per date, ascending by date. Averages are emitted only from `from` on, but earlier
 * readings still count toward them: pass the lead-in (the 6 days before `from`) so the first points get a full
 * window. Averages are rounded to 2 decimals.
 */
export function movingAverage(
  readings: { date: string; weight_lb: number }[],
  from: string,
): { date: string; avg_lb: number }[] {
  const out: { date: string; avg_lb: number }[] = [];
  let start = 0; // first reading still inside the window
  for (const [i, { date }] of readings.entries()) {
    const windowStart = addDays(date, 1 - MOVING_AVG_DAYS);
    while (readings[start]!.date < windowStart) start++;
    if (date < from) continue;
    const window = readings.slice(start, i + 1);
    const avg = window.reduce((sum, r) => sum + r.weight_lb, 0) / window.length;
    out.push({ date, avg_lb: Math.round(avg * 100) / 100 });
  }
  return out;
}
