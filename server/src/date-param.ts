import { LocalDateSchema } from "@calorie-tracker/shared";
import { today } from "./today.js";

/** The 400 body for a date param that failed `parseDateParam`. */
export const invalidDateBody = {
  error: "invalid_date",
  reason: "Use YYYY-MM-DD or 'today', not in the future",
} as const;

/**
 * Resolves a `:date` path param: `today` or a real YYYY-MM-DD that isn't after today (in `TZ`).
 * Returns the YYYY-MM-DD, or null if the param is malformed or in the future.
 */
export function parseDateParam(param: string, now: Date = new Date()): string | null {
  const current = today(now);
  const date = param === "today" ? current : param;
  if (!LocalDateSchema.safeParse(date).success) return null;
  return date > current ? null : date;
}
