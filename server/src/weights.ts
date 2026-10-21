import { Hono } from "hono";
import {
  addDays,
  DEFAULT_WEIGHT_RANGE,
  PutWeightRequestSchema,
  WEIGHT_RANGE_DAYS,
  WeightRangeSchema,
  type DeleteWeightResponse,
  type PutWeightResponse,
  type Weight,
  type WeightsResponse,
} from "@calorie-tracker/shared";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { invalidDateBody, parseDateParam } from "./date-param.js";
import type { Db } from "./db/index.js";
import { weights } from "./db/schema.js";
import { firstIssue } from "./first-issue.js";
import { MOVING_AVG_DAYS, movingAverage } from "./moving-average.js";
import { today } from "./today.js";

/** A day's weight, or null if none was logged. `getDay` returns this as `weight`. */
export function getWeight(db: Db, date: string): Weight | null {
  const row = db.select().from(weights).where(eq(weights.localDate, date)).get();
  return row ? { weight_lb: row.weightLb, created_at: row.createdAt } : null;
}

/** `GET /weights`, `PUT`/`DELETE /weights/:date`, mounted under `/api`. */
export function weightRoutes(db: Db, now: () => Date) {
  const routes = new Hono();

  routes.get("/weights", (c) => {
    const parsed = WeightRangeSchema.safeParse(c.req.query("range") ?? DEFAULT_WEIGHT_RANGE);
    if (!parsed.success) {
      return c.json({ error: "invalid_request", reason: "range: use 30d, 90d or 1y" }, 400);
    }
    const range = parsed.data;
    const end = today(now());
    const from = addDays(end, -WEIGHT_RANGE_DAYS[range]);
    // Read the lead-in too, so the first points in range get a full 7-day average.
    const readings = db
      .select({ date: weights.localDate, weight_lb: weights.weightLb })
      .from(weights)
      .where(and(gte(weights.localDate, addDays(from, 1 - MOVING_AVG_DAYS)), lte(weights.localDate, end)))
      .orderBy(asc(weights.localDate))
      .all();
    return c.json({
      range,
      from,
      today: end,
      points: readings.filter((r) => r.date >= from),
      moving_avg: movingAverage(readings, from),
    } satisfies WeightsResponse);
  });

  routes.put("/weights/:date", async (c) => {
    const date = parseDateParam(c.req.param("date"), now());
    if (!date) return c.json(invalidDateBody, 400);
    const body = PutWeightRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_request", reason: firstIssue(body.error) }, 400);
    // A new weight for the same day replaces the old one, including its timestamp.
    const row = { weightLb: body.data.weight_lb, createdAt: now().toISOString() };
    db.insert(weights)
      .values({ localDate: date, ...row })
      .onConflictDoUpdate({ target: weights.localDate, set: row })
      .run();
    return c.json({ local_date: date, weight_lb: row.weightLb, created_at: row.createdAt } satisfies PutWeightResponse);
  });

  routes.delete("/weights/:date", (c) => {
    const date = parseDateParam(c.req.param("date"), now());
    if (!date) return c.json(invalidDateBody, 400);
    const deleted = db.delete(weights).where(eq(weights.localDate, date)).returning().all();
    if (deleted.length === 0) return c.json({ error: "not_found", reason: "Weight not found" }, 404);
    return c.json({ local_date: date } satisfies DeleteWeightResponse);
  });

  return routes;
}
