import type { Burn } from "@calorie-tracker/shared";
import type { Db } from "./db/index.js";

/**
 * A day's burn entries, oldest first. Stub until task 07 adds the `burns` table:
 * `getDay` already sums these into `totals.burned_kcal`, so only this body needs to change.
 */
export function getBurns(_db: Db, _date: string): Burn[] {
  return [];
}
