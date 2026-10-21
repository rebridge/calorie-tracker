import { Hono } from "hono";
import {
  PutWeightRequestSchema,
  type DeleteWeightResponse,
  type PutWeightResponse,
  type Weight,
} from "@calorie-tracker/shared";
import { eq } from "drizzle-orm";
import { invalidDateBody, parseDateParam } from "./date-param.js";
import type { Db } from "./db/index.js";
import { weights } from "./db/schema.js";

/** A day's weight, or null if none was logged. `getDay` returns this as `weight`. */
export function getWeight(db: Db, date: string): Weight | null {
  const row = db.select().from(weights).where(eq(weights.localDate, date)).get();
  return row ? { weight_lb: row.weightLb, created_at: row.createdAt } : null;
}

/** `PUT`/`DELETE /weights/:date`, mounted under `/api`. */
export function weightRoutes(db: Db, now: () => Date) {
  const routes = new Hono();

  routes.put("/weights/:date", async (c) => {
    const date = parseDateParam(c.req.param("date"), now());
    if (!date) return c.json(invalidDateBody, 400);
    const body = PutWeightRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      const issue = body.error.issues[0]!;
      const field = issue.path.join(".");
      return c.json({ error: "invalid_request", reason: field ? `${field}: ${issue.message}` : issue.message }, 400);
    }
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
