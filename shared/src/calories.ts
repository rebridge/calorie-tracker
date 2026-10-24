import { z } from "zod";
import { LocalDateSchema } from "./dates.js";
import { WEIGHT_RANGE_DAYS } from "./weights.js";

/** `GET /api/calories?range=…`: the weight trend's ranges plus a week. */
export const CalorieRangeSchema = z.enum(["7d", "30d", "90d", "1y"]);
export type CalorieRange = z.infer<typeof CalorieRangeSchema>;
export const DEFAULT_CALORIE_RANGE: CalorieRange = "30d";

/** Days back from today that each range starts at. A week is today and the 6 days before, so it shows 7 days. */
export const CALORIE_RANGE_DAYS: Record<CalorieRange, number> = { "7d": 6, ...WEIGHT_RANGE_DAYS };

/**
 * `GET /api/calories?range=…`: calories eaten and burned per day from `from`
 * through `today` (inclusive). Only days with a meal or a burn are listed; the other total is 0 on such a day.
 * `goal_kcal` is the current calorie goal: goals aren't kept per day, so every day is measured against it.
 */
export const CaloriesResponseSchema = z.object({
  range: CalorieRangeSchema,
  from: LocalDateSchema,
  today: LocalDateSchema,
  goal_kcal: z.number(),
  points: z.array(z.object({ date: LocalDateSchema, eaten_kcal: z.number(), burned_kcal: z.number() })),
});
export type CaloriesResponse = z.infer<typeof CaloriesResponseSchema>;
