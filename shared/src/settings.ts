import { z } from "zod";

const GOAL_MESSAGE = "Enter a whole number greater than 0";
const goal = z.number({ error: GOAL_MESSAGE }).int(GOAL_MESSAGE).positive(GOAL_MESSAGE);

/** The user's daily goals (spec §3 `settings`); also the body of `PUT /api/settings`. */
export const SettingsSchema = z.object({
  calorie_goal: goal,
  protein_goal_g: goal,
  carbs_goal_g: goal,
  fat_goal_g: goal,
});
export type Settings = z.infer<typeof SettingsSchema>;

/** `GET`/`PUT /api/settings`: the goals plus read-only info shown on the Settings page. */
export const SettingsResponseSchema = SettingsSchema.extend({
  model: z.string(),
  database_path: z.string(),
  /** Model tokens summed over every saved entry; deleted entries and failed calls aren't counted. */
  token_usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;
