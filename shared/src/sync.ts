import { z } from "zod";
import { LoggedAtSchema } from "./client-id.js";
import { LocalDateSchema } from "./dates.js";
import { ConfidenceSchema, MAX_ENTRY_TEXT_LENGTH, MealTypeSchema } from "./meals.js";

// The iOS app's upload endpoints. The phone saves entries and burns while it can't reach the server and uploads
// them later, keyed by its own id for each record (`ClientIdSchema`), so an upload can be retried safely.

const nonNegative = z.number().min(0);

/** One item as the phone saved it: Claude's estimate, possibly edited on the phone before it was uploaded. */
export const SyncItemSchema = z.object({
  name: z.string().trim().min(1),
  portion: z.string(),
  calories: nonNegative,
  protein_g: nonNegative,
  carbs_g: nonNegative,
  fat_g: nonNegative,
  confidence: ConfidenceSchema,
  assumption: z.string().nullable(),
  edited: z.boolean(),
});
export type SyncItem = z.infer<typeof SyncItemSchema>;

/**
 * `PUT /api/sync/entries/:client_id`: an entry the phone estimated by calling Claude itself. Creates it (201), or
 * replaces its meal type and items when that client id was uploaded before (200). Returns the `Entry`.
 */
export const SyncEntryRequestSchema = z.object({
  date: LocalDateSchema,
  logged_at: LoggedAtSchema,
  meal_type: MealTypeSchema,
  text: z
    .string()
    .max(MAX_ENTRY_TEXT_LENGTH, `Too long: ${MAX_ENTRY_TEXT_LENGTH} characters max`)
    .refine((text) => text.trim() !== "", "Describe what you ate"),
  model: z.string().min(1),
  /** The raw JSON body of Claude's reply, kept verbatim as the audit trail. */
  model_response: z.string().refine((text) => {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }, "Must be the JSON text of the model's reply"),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  items: z.array(SyncItemSchema).min(1, "An entry needs at least one item"),
});
export type SyncEntryRequest = z.infer<typeof SyncEntryRequestSchema>;

/**
 * `PUT /api/sync/burns/:client_id`: a burn logged on the phone. Creates it (201), or updates its calories and note
 * when that client id was uploaded before (200). Returns the `Burn`.
 */
export const SyncBurnRequestSchema = z.object({
  date: LocalDateSchema,
  logged_at: LoggedAtSchema,
  calories: z.number().int().positive(),
  note: z.string().trim().max(200).nullable(),
});
export type SyncBurnRequest = z.infer<typeof SyncBurnRequestSchema>;
