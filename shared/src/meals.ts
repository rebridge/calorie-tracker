import { z } from "zod";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export const MealTypeSchema = z.enum(MEAL_TYPES);
export type MealType = z.infer<typeof MealTypeSchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** YYYY-MM-DD that is also a real calendar date (rejects 2026-02-30). */
export const LocalDateSchema = z.iso.date();

/** Claude's structured output for one submission (spec §4). */
export const MealSchema = z.object({
  meal_type: MealTypeSchema.nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      portion: z.string(),
      calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
      confidence: ConfidenceSchema,
      assumption: z.string().nullable(),
    }),
  ),
  // set when the input isn't food ("hello", "ran 3 miles")
  not_food_reason: z.string().nullable(),
});
export type Meal = z.infer<typeof MealSchema>;

export const CreateEntryRequestSchema = z.object({
  text: z.string().trim().min(1),
  date: LocalDateSchema.optional(),
  meal_type: MealTypeSchema.optional(),
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

export const DayResponseSchema = z.object({
  date: LocalDateSchema,
  /** Always all four meals, Breakfast → Lunch → Dinner → Snack; newest entry first within each. */
  meals: z.array(MealGroupSchema),
  totals: MacrosSchema,
});
export type DayResponse = z.infer<typeof DayResponseSchema>;
