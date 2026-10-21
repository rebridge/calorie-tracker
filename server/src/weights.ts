import type { Weight } from "@calorie-tracker/shared";
import type { Db } from "./db/index.js";

/**
 * A day's weight, or null if none was logged. Stub until task 08 adds the `weights` table:
 * `getDay` already returns this as `weight`, so only this body needs to change.
 */
export function getWeight(_db: Db, _date: string): Weight | null {
  return null;
}
