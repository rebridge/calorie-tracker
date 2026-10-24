import type { CalorieRange } from "@calorie-tracker/shared";
import type { z } from "zod";

/** Every range a trend chart can show: the calorie chart's, a superset of the weight chart's. */
type TrendRange = CalorieRange;

/** Spacing between x-axis labels, counted back from today so the last label is always today. */
export const TICK_STEP_DAYS: Record<TrendRange, number> = { "7d": 1, "30d": 10, "90d": 30, "1y": 73 };

export const MS_PER_DAY = 86_400_000;
/** A YYYY-MM-DD as a whole day count since the epoch: a numeric x value, so a gap in the readings is a gap on the axis. */
export const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY;

// Pinned to en-US and UTC, like the other date labels, so a tick never shifts with the phone's locale or zone.
const tickMonthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const tickMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const tickWeekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
/** "Oct '25", so a bare "Oct 25" can't be read as the 25th. */
const tickMonthYear = {
  format: (d: Date) => `${tickMonth.format(d)} '${String(d.getUTCFullYear()).slice(-2)}`,
};

/** X-axis label for a day number: weekday on 7d, month and year on 1y, otherwise month and day. */
export const tickFormatter = (range: TrendRange) => {
  const format = range === "7d" ? tickWeekday : range === "1y" ? tickMonthYear : tickMonthDay;
  return (n: number) => format.format(new Date(n * MS_PER_DAY));
};

/** X-axis ticks from `from` through `today`, spaced for the range and ending on today. */
export function xAxisTicks(range: TrendRange, from: string, today: string): number[] {
  const [start, end] = [dayNumber(from), dayNumber(today)];
  const out: number[] = [];
  for (let t = end; t >= start; t -= TICK_STEP_DAYS[range]) out.unshift(t);
  return out;
}

/**
 * A chart's range choice, remembered under `key`. Charts remount on every day change; the module-level value keeps
 * the chosen range (and storage carries it over a reload where allowed).
 */
export function rangeMemory<R extends TrendRange>(key: string, schema: z.ZodType<R>, fallback: R) {
  let selected: R = (() => {
    try {
      const stored = schema.safeParse(localStorage.getItem(key));
      if (stored.success) return stored.data;
    } catch {
      // Storage can be blocked (private mode); the module variable still carries the choice across days.
    }
    return fallback;
  })();
  return {
    get: () => selected,
    set(range: R) {
      selected = range;
      try {
        localStorage.setItem(key, range);
      } catch {
        // Not persisted across reloads; fine.
      }
    },
  };
}
