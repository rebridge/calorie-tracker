import { z } from "zod";
import { LocalDateSchema } from "./dates.js";

/** A day's weight as shown on that day (spec §3 `weights`; at most one per day). */
export const WeightSchema = z.object({
  weight_lb: z.number(),
  created_at: z.string(),
});
export type Weight = z.infer<typeof WeightSchema>;

/** `PUT /api/weights/:date`. The date comes from the path (`YYYY-MM-DD` or `today`). */
export const PutWeightRequestSchema = z.object({
  weight_lb: z.number().positive(),
});
export type PutWeightRequest = z.infer<typeof PutWeightRequestSchema>;

/** The saved weight, with the resolved day (so a request for `today` also says which day that was). */
export const PutWeightResponseSchema = WeightSchema.extend({ local_date: LocalDateSchema });
export type PutWeightResponse = z.infer<typeof PutWeightResponseSchema>;

export const DeleteWeightResponseSchema = z.object({ local_date: LocalDateSchema });
export type DeleteWeightResponse = z.infer<typeof DeleteWeightResponseSchema>;
