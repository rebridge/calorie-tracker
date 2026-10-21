import { z } from "zod";
import { LocalDateSchema } from "./dates.js";

/** A day's weight as shown on that day (spec §3 `weights`; at most one per day). */
export const WeightSchema = z.object({
  weight_lb: z.number(),
  created_at: z.string(),
});
export type Weight = z.infer<typeof WeightSchema>;

/** Heaviest weight accepted; anything above is a typo. */
export const MAX_WEIGHT_LB = 1500;

/** `PUT /api/weights/:date`. The date comes from the path (`YYYY-MM-DD` or `today`). */
export const PutWeightRequestSchema = z.object({
  weight_lb: z.number().positive().max(MAX_WEIGHT_LB),
});
export type PutWeightRequest = z.infer<typeof PutWeightRequestSchema>;

/** The saved weight, with the resolved day (so a request for `today` also says which day that was). */
export const PutWeightResponseSchema = WeightSchema.extend({ local_date: LocalDateSchema });
export type PutWeightResponse = z.infer<typeof PutWeightResponseSchema>;

export const DeleteWeightResponseSchema = z.object({ local_date: LocalDateSchema });
export type DeleteWeightResponse = z.infer<typeof DeleteWeightResponseSchema>;

/** `GET /api/weights?range=…`: how far back the trend looks. */
export const WeightRangeSchema = z.enum(["30d", "90d", "1y"]);
export type WeightRange = z.infer<typeof WeightRangeSchema>;
export const DEFAULT_WEIGHT_RANGE: WeightRange = "30d";

/** Days back from today that each range starts at (a year is 365 days). */
export const WEIGHT_RANGE_DAYS: Record<WeightRange, number> = { "30d": 30, "90d": 90, "1y": 365 };

/**
 * `GET /api/weights`: the raw readings from `from` through `today` (inclusive), and their trailing 7-day average.
 * `today` is the server's today (the chart's x-axis end), so the client never decides where the range stops.
 */
export const WeightsResponseSchema = z.object({
  range: WeightRangeSchema,
  from: LocalDateSchema,
  today: LocalDateSchema,
  points: z.array(z.object({ date: LocalDateSchema, weight_lb: z.number() })),
  moving_avg: z.array(z.object({ date: LocalDateSchema, avg_lb: z.number() })),
});
export type WeightsResponse = z.infer<typeof WeightsResponseSchema>;
