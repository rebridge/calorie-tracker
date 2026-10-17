import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

// Single row, id = 1.
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  calorieGoal: integer("calorie_goal").notNull().default(2000),
  proteinGoalG: integer("protein_goal_g").notNull().default(150),
  carbsGoalG: integer("carbs_goal_g").notNull().default(200),
  fatGoalG: integer("fat_goal_g").notNull().default(65),
});
