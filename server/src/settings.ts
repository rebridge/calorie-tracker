import { Hono } from "hono";
import { SettingsSchema, type Settings, type SettingsResponse } from "@calorie-tracker/shared";
import { eq, sql } from "drizzle-orm";
import { MODEL } from "./claude.js";
import type { Db } from "./db/index.js";
import { entries, settings } from "./db/schema.js";
import { firstIssue } from "./first-issue.js";

/** The current goals; also embedded in every day response. */
export function getGoals(db: Db): Settings {
  // Row id = 1 is seeded by the first migration.
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) throw new Error("settings row missing");
  return {
    calorie_goal: row.calorieGoal,
    protein_goal_g: row.proteinGoalG,
    carbs_goal_g: row.carbsGoalG,
    fat_goal_g: row.fatGoalG,
  };
}

function getSettings(db: Db): SettingsResponse {
  const usage = db
    .select({
      input: sql<number>`coalesce(sum(${entries.inputTokens}), 0)`,
      output: sql<number>`coalesce(sum(${entries.outputTokens}), 0)`,
    })
    .from(entries)
    .get();
  return {
    ...getGoals(db),
    model: MODEL,
    database_path: db.$client.name,
    token_usage: { input_tokens: usage?.input ?? 0, output_tokens: usage?.output ?? 0 },
  };
}

/** `GET`/`PUT /settings`, mounted under `/api`. */
export function settingsRoutes(db: Db) {
  const routes = new Hono();

  routes.get("/settings", (c) => c.json(getSettings(db)));

  routes.put("/settings", async (c) => {
    const body = SettingsSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_request", reason: firstIssue(body.error) }, 400);
    const g = body.data;
    db.update(settings)
      .set({
        calorieGoal: g.calorie_goal,
        proteinGoalG: g.protein_goal_g,
        carbsGoalG: g.carbs_goal_g,
        fatGoalG: g.fat_goal_g,
      })
      .where(eq(settings.id, 1))
      .run();
    return c.json(getSettings(db));
  });

  return routes;
}
