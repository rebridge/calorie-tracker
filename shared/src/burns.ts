import { z } from "zod";
import { LocalDateSchema } from "./dates.js";

/** A manual calories-burned entry (spec §3 `burns`). Task 07 adds its request/response schemas here. */
export const BurnSchema = z.object({
  id: z.number(),
  local_date: LocalDateSchema,
  calories: z.number(),
  note: z.string().nullable(),
  created_at: z.string(),
});
export type Burn = z.infer<typeof BurnSchema>;
