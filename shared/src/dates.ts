import { z } from "zod";

/** YYYY-MM-DD that is also a real calendar date (rejects 2026-02-30). */
export const LocalDateSchema = z.iso.date();

const DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Splits a YYYY-MM-DD into numbers. Callers pass dates that already passed `LocalDateSchema`. */
function parts(date: string): [number, number, number] {
  const m = DATE_PARTS.exec(date);
  if (!m) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** The date `days` after `date` (negative goes back). Pure calendar math in UTC, so DST never shifts it. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Pinned to en-US so labels read "Mon, Oct 13" whatever the phone's locale; UTC so the date never shifts.
const shortDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const shortDateYear = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Mon, Oct 13", with the year ("Mon, Oct 13, 2025") when it isn't `today`'s year. */
export function formatShortDate(date: string, today: string): string {
  const [y, m, d] = parts(date);
  const sameYear = y === parts(today)[0];
  return (sameYear ? shortDate : shortDateYear).format(new Date(Date.UTC(y, m - 1, d)));
}

/** The Day view's date-bar label: "Today", "Yesterday", or "Mon, Oct 13". */
export function formatDayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatShortDate(date, today);
}

/** A YYYY-MM-DD as a local-midnight `Date`, which is what the calendar picker works in. */
export function toCalendarDate(date: string): Date {
  const [y, m, d] = parts(date);
  return new Date(y, m - 1, d);
}

/** The inverse of `toCalendarDate`: the picker's local-midnight `Date` back to YYYY-MM-DD. */
export function fromCalendarDate(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A swipe must travel at least this far (px) to count. */
export const SWIPE_MIN_DISTANCE = 60;

/**
 * Which way a finished horizontal touch moves the Day view: -1 = previous day (finger moved right),
 * 1 = next day (finger moved left), 0 = not a swipe. Short drags and mostly-vertical drags (scrolling) are ignored.
 */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < 2 * Math.abs(dy)) return 0;
  return dx > 0 ? -1 : 1;
}
