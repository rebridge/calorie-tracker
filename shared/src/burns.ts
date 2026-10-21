import { z } from "zod";
import { LocalDateSchema } from "./dates.js";

/** A manual calories-burned entry (spec §3 `burns`). */
export const BurnSchema = z.object({
  id: z.number(),
  local_date: LocalDateSchema,
  calories: z.number(),
  note: z.string().nullable(),
  created_at: z.string(),
});
export type Burn = z.infer<typeof BurnSchema>;

/** Optional free text such as "evening run"; blank is stored as no note. */
const NoteSchema = z.string().trim().max(200).nullable();

/** `date` defaults to today on the server; a future date is rejected. */
export const CreateBurnRequestSchema = z.object({
  calories: z.number().int().positive(),
  note: NoteSchema.optional(),
  date: LocalDateSchema.optional(),
});
export type CreateBurnRequest = z.infer<typeof CreateBurnRequestSchema>;

/** Partial edit of one burn; at least one field is required. */
export const UpdateBurnRequestSchema = z
  .object({
    calories: z.number().int().positive(),
    note: NoteSchema,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "Provide at least one field to update" });
export type UpdateBurnRequest = z.infer<typeof UpdateBurnRequestSchema>;

// Create and update return the burn itself (it carries `local_date`); delete says which day it was on.
export const DeleteBurnResponseSchema = z.object({ local_date: LocalDateSchema });
export type DeleteBurnResponse = z.infer<typeof DeleteBurnResponseSchema>;
