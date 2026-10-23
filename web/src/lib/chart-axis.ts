import { WeightRangeSchema, type WeightRange } from "@calorie-tracker/shared";

/** The ranges both trend charts offer. */
export const RANGES: WeightRange[] = ["30d", "90d", "1y"];

/** Spacing between x-axis labels, counted back from today so the last label is always today. */
export const TICK_STEP_DAYS: Record<WeightRange, number> = { "30d": 10, "90d": 30, "1y": 73 };

export const MS_PER_DAY = 86_400_000;
/** A YYYY-MM-DD as a whole day count since the epoch: a numeric x value, so a gap in the readings is a gap on the axis. */
export const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY;

// Pinned to en-US and UTC, like the other date labels, so a tick never shifts with the phone's locale or zone.
const tickMonthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const tickMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
/** "Oct '25", so a bare "Oct 25" can't be read as the 25th. */
const tickMonthYear = {
  format: (d: Date) => `${tickMonth.format(d)} '${String(d.getUTCFullYear()).slice(-2)}`,
};

/** X-axis label for a day number: month and day, or month and year on the 1y range. */
export const tickFormatter = (range: WeightRange) => {
  const format = range === "1y" ? tickMonthYear : tickMonthDay;
  return (n: number) => format.format(new Date(n * MS_PER_DAY));
};

/** X-axis ticks from `from` through `today`, spaced for the range and ending on today. */
export function xAxisTicks(range: WeightRange, from: string, today: string): number[] {
  const [start, end] = [dayNumber(from), dayNumber(today)];
  const out: number[] = [];
  for (let t = end; t >= start; t -= TICK_STEP_DAYS[range]) out.unshift(t);
  return out;
}

/**
 * A chart's range choice, remembered under `key`. Charts remount on every day change; the module-level value keeps
 * the chosen range (and storage carries it over a reload where allowed).
 */
export function rangeMemory(key: string) {
  let selected: WeightRange = (() => {
    try {
      const stored = WeightRangeSchema.safeParse(localStorage.getItem(key));
      if (stored.success) return stored.data;
    } catch {
      // Storage can be blocked (private mode); the module variable still carries the choice across days.
    }
    return "30d";
  })();
  return {
    get: () => selected,
    set(range: WeightRange) {
      selected = range;
      try {
        localStorage.setItem(key, range);
      } catch {
        // Not persisted across reloads; fine.
      }
    },
  };
}
