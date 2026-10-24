import { z } from "zod";
import { BurnSchema } from "./burns.js";
import { ClientIdSchema, LoggedAtSchema } from "./client-id.js";
import { LocalDateSchema } from "./dates.js";
import { SettingsSchema } from "./settings.js";
import { WeightSchema } from "./weights.js";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export const MealTypeSchema = z.enum(MEAL_TYPES);
export type MealType = z.infer<typeof MealTypeSchema>;

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export const ConfidenceSchema = z.enum(CONFIDENCE_LEVELS);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/**
 * The SDK's JSON schema carries enums only as a description, so the model can answer "Breakfast", "HIGH" or
 * "brunch". Normalise instead of failing the whole submission: an unknown meal type becomes null (the
 * time-of-day fallback applies), an unknown confidence becomes "low".
 */
const lenientEnum = <T extends string>(values: readonly T[], fallback: T | null) => (value: unknown) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  return values.find((v) => v === normalized) ?? fallback;
};

/** Claude's structured output for one submission (spec §4). */
export const MealSchema = z.object({
  meal_type: z.preprocess(lenientEnum(MEAL_TYPES, null), MealTypeSchema.nullable()),
  items: z.array(
    z.object({
      name: z.string(),
      portion: z.string(),
      calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
      confidence: z.preprocess(lenientEnum(CONFIDENCE_LEVELS, "low"), ConfidenceSchema),
      assumption: z.string().nullable(),
    }),
  ),
  // set when the input isn't food ("hello", "ran 3 miles")
  not_food_reason: z.string().nullable(),
});
export type Meal = z.infer<typeof MealSchema>;

/** Longest meal description accepted; it goes to the model as is. */
export const MAX_ENTRY_TEXT_LENGTH = 2000;

export const CreateEntryRequestSchema = z.object({
  // Not trimmed: `raw_text` keeps exactly what was typed. Whitespace-only is still rejected.
  text: z
    .string()
    .max(MAX_ENTRY_TEXT_LENGTH, `Too long: ${MAX_ENTRY_TEXT_LENGTH} characters max`)
    .refine((text) => text.trim() !== "", "Describe what you ate"),
  date: LocalDateSchema.optional(),
  meal_type: MealTypeSchema.optional(),
  /**
   * Sent by the iOS app when it queued the text offline for the server to estimate. A retry with the same id
   * returns the saved entry without calling the model again.
   */
  client_id: ClientIdSchema.optional(),
  /** When the phone logged it: sets `created_at` and the local time sent to the model. */
  logged_at: LoggedAtSchema.optional(),
});
export type CreateEntryRequest = z.infer<typeof CreateEntryRequestSchema>;

const MacrosSchema = z.object({
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});
export type Macros = z.infer<typeof MacrosSchema>;

export const EntryItemSchema = MacrosSchema.extend({
  id: z.number(),
  entry_id: z.number(),
  name: z.string(),
  portion: z.string(),
  confidence: ConfidenceSchema,
  assumption: z.string().nullable(),
  edited: z.boolean(),
});
export type EntryItem = z.infer<typeof EntryItemSchema>;

/** An entry with its items; the macro fields are the sum of its items. */
export const EntrySchema = MacrosSchema.extend({
  id: z.number(),
  created_at: z.string(),
  local_date: LocalDateSchema,
  meal_type: MealTypeSchema,
  raw_text: z.string(),
  items: z.array(EntryItemSchema),
});
export type Entry = z.infer<typeof EntrySchema>;

export const MealGroupSchema = z.object({
  meal_type: MealTypeSchema,
  calories: z.number(),
  entries: z.array(EntrySchema),
});
export type MealGroup = z.infer<typeof MealGroupSchema>;

/** Day totals: calories eaten and burned, and the macros eaten. */
export const DayTotalsSchema = z.object({
  eaten_kcal: z.number(),
  burned_kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});
export type DayTotals = z.infer<typeof DayTotalsSchema>;

/** `GET /api/day/:date`. Burns and weight are filled in by tasks 07 and 08; the shape is final. */
export const DayResponseSchema = z.object({
  /** The resolved YYYY-MM-DD, so a request for `today` also says which day that was. */
  date: LocalDateSchema,
  /** Always all four meals, Breakfast → Lunch → Dinner → Snack; newest entry first within each. */
  meals: z.array(MealGroupSchema),
  burns: z.array(BurnSchema),
  weight: WeightSchema.nullable(),
  /** The current goals, even for past days (goal history isn't stored). */
  goals: SettingsSchema,
  totals: DayTotalsSchema,
});
export type DayResponse = z.infer<typeof DayResponseSchema>;

const nonNegative = z.number().min(0);

/** Partial edit of one item; at least one field is required. Any edit marks the item `edited`. */
export const UpdateItemRequestSchema = z
  .object({
    name: z.string().trim().min(1),
    portion: z.string().trim().min(1),
    calories: nonNegative,
    protein_g: nonNegative,
    carbs_g: nonNegative,
    fat_g: nonNegative,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "Provide at least one field to update" });
export type UpdateItemRequest = z.infer<typeof UpdateItemRequestSchema>;

export const UpdateEntryRequestSchema = z.object({ meal_type: MealTypeSchema });
export type UpdateEntryRequest = z.infer<typeof UpdateEntryRequestSchema>;

// Mutation responses carry `local_date` so the client knows which ['day', date] query to invalidate.
export const UpdateItemResponseSchema = z.object({ local_date: LocalDateSchema, item: EntryItemSchema });
export type UpdateItemResponse = z.infer<typeof UpdateItemResponseSchema>;

export const UpdateEntryResponseSchema = z.object({ local_date: LocalDateSchema, entry: EntrySchema });
export type UpdateEntryResponse = z.infer<typeof UpdateEntryResponseSchema>;

export const DeleteItemResponseSchema = z.object({
  local_date: LocalDateSchema,
  /** True when that was the entry's last item, so the whole entry went too. */
  entry_deleted: z.boolean(),
});
export type DeleteItemResponse = z.infer<typeof DeleteItemResponseSchema>;

export const DeleteEntryResponseSchema = z.object({ local_date: LocalDateSchema });
export type DeleteEntryResponse = z.infer<typeof DeleteEntryResponseSchema>;
