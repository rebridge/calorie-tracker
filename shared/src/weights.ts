import { z } from "zod";

/** A day's weight as shown on that day (spec §3 `weights`). Task 08 adds its request/response schemas here. */
export const WeightSchema = z.object({
  weight_lb: z.number(),
  created_at: z.string(),
});
export type Weight = z.infer<typeof WeightSchema>;
