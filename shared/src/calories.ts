import { z } from "zod";
import { LocalDateSchema } from "./dates.js";
import { WeightRangeSchema } from "./weights.js";

/**
 * `GET /api/calories?range=…` (same ranges as the weight trend): calories eaten and burned per day from `from`
 * through `today` (inclusive). Only days with a meal or a burn are listed; the other total is 0 on such a day.
 */
export const CaloriesResponseSchema = z.object({
  range: WeightRangeSchema,
  from: LocalDateSchema,
  today: LocalDateSchema,
  points: z.array(z.object({ date: LocalDateSchema, eaten_kcal: z.number(), burned_kcal: z.number() })),
});
export type CaloriesResponse = z.infer<typeof CaloriesResponseSchema>;
