import { Hono } from "hono";
import {
  addDays,
  DEFAULT_WEIGHT_RANGE,
  WEIGHT_RANGE_DAYS,
  WeightRangeSchema,
  type CaloriesResponse,
} from "@calorie-tracker/shared";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { burns, entries, entryItems } from "./db/schema.js";
import { getGoals } from "./settings.js";
import { today } from "./today.js";

/** `GET /calories`, mounted under `/api`: daily calories eaten and burned, and the goal, for the chart above the weight trend. */
export function calorieRoutes(db: Db, now: () => Date) {
  const routes = new Hono();

  routes.get("/calories", (c) => {
    const parsed = WeightRangeSchema.safeParse(c.req.query("range") ?? DEFAULT_WEIGHT_RANGE);
    if (!parsed.success) {
      return c.json({ error: "invalid_request", reason: "range: use 30d, 90d or 1y" }, 400);
    }
    const range = parsed.data;
    const end = today(now());
    const from = addDays(end, -WEIGHT_RANGE_DAYS[range]);

    const eaten = db
      .select({ date: entries.localDate, kcal: sql<number>`sum(${entryItems.calories})` })
      .from(entryItems)
      .innerJoin(entries, eq(entryItems.entryId, entries.id))
      .where(and(gte(entries.localDate, from), lte(entries.localDate, end)))
      .groupBy(entries.localDate)
      .orderBy(asc(entries.localDate))
      .all();
    const burned = db
      .select({ date: burns.localDate, kcal: sql<number>`sum(${burns.calories})` })
      .from(burns)
      .where(and(gte(burns.localDate, from), lte(burns.localDate, end)))
      .groupBy(burns.localDate)
      .all();

    const byDate = new Map<string, CaloriesResponse["points"][number]>();
    const day = (date: string) => byDate.get(date) ?? byDate.set(date, { date, eaten_kcal: 0, burned_kcal: 0 }).get(date)!;
    for (const r of eaten) day(r.date).eaten_kcal = r.kcal;
    for (const r of burned) day(r.date).burned_kcal = r.kcal;

    return c.json({
      range,
      from,
      today: end,
      goal_kcal: getGoals(db).calorie_goal,
      points: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    } satisfies CaloriesResponse);
  });

  return routes;
}
