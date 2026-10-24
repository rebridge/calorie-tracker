import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Single row, id = 1.
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  calorieGoal: integer("calorie_goal").notNull().default(2000),
  proteinGoalG: integer("protein_goal_g").notNull().default(150),
  carbsGoalG: integer("carbs_goal_g").notNull().default(200),
  fatGoalG: integer("fat_goal_g").notNull().default(65),
});

// One per submission.
export const entries = sqliteTable(
  "entries",
  {
    id: integer("id").primaryKey(),
    createdAt: text("created_at").notNull(),
    localDate: text("local_date").notNull(),
    mealType: text("meal_type", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull(),
    rawText: text("raw_text").notNull(),
    model: text("model").notNull(),
    modelResponse: text("model_response").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    // Set by the iOS app, which creates entries offline: retrying an upload finds the row instead of duplicating it.
    clientId: text("client_id"),
  },
  (t) => [index("entries_local_date_idx").on(t.localDate), uniqueIndex("entries_client_id_idx").on(t.clientId)],
);

// Parsed food items.
export const entryItems = sqliteTable(
  "entry_items",
  {
    id: integer("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    portion: text("portion").notNull(),
    calories: integer("calories").notNull(),
    proteinG: real("protein_g").notNull(),
    carbsG: real("carbs_g").notNull(),
    fatG: real("fat_g").notNull(),
    confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(),
    assumption: text("assumption"),
    edited: integer("edited", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("entry_items_entry_id_idx").on(t.entryId)],
);

// At most one per day: a new weight for the same day replaces the old one.
export const weights = sqliteTable("weights", {
  localDate: text("local_date").primaryKey(),
  weightLb: real("weight_lb").notNull(),
  createdAt: text("created_at").notNull(),
});

// Manual calories-burned entries; they add to the day's budget.
export const burns = sqliteTable(
  "burns",
  {
    id: integer("id").primaryKey(),
    localDate: text("local_date").notNull(),
    calories: integer("calories").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    // Same as `entries.client_id`.
    clientId: text("client_id"),
  },
  (t) => [index("burns_local_date_idx").on(t.localDate), uniqueIndex("burns_client_id_idx").on(t.clientId)],
);
