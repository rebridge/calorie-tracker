import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  CreateEntryRequestSchema,
  LocalDateSchema,
  type DayResponse,
  type Entry,
  type HealthResponse,
} from "@calorie-tracker/shared";
import { sql } from "drizzle-orm";
import type { MealEstimator } from "./claude.js";
import type { Db } from "./db/index.js";
import { createEntry, getDay } from "./entries.js";
import { resolveMealType } from "./meal-type.js";
import { localTime, today } from "./today.js";

export function createApp({
  db,
  webDist,
  estimateMeal,
  now = () => new Date(),
}: {
  db: Db;
  webDist?: string;
  estimateMeal: MealEstimator;
  /** Injectable clock for tests. "Today" always comes from the server, never the client. */
  now?: () => Date;
}) {
  const app = new Hono();

  /** Resolves `today` or a YYYY-MM-DD that isn't in the future; null if invalid. */
  function parseDate(param: string): string | null {
    const date = param === "today" ? today(now()) : param;
    if (!LocalDateSchema.safeParse(date).success) return null;
    return date > today(now()) ? null : date;
  }

  const api = new Hono();
  api.get("/health", (c) => {
    db.run(sql`select 1`);
    return c.json({ ok: true } satisfies HealthResponse);
  });

  api.post("/entries", async (c) => {
    const body = CreateEntryRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_request", reason: body.error.message }, 400);
    const { text, date, meal_type } = body.data;

    const instant = now();
    const localDate = today(instant);
    // Backdating arrives in task 10; until then only today is accepted.
    if (date !== undefined && date !== localDate) {
      return c.json({ error: "invalid_request", reason: "Entries can only be logged for today" }, 400);
    }

    const time = localTime(instant);
    const estimate = await estimateMeal({ text, localTime: time });
    const entry = createEntry(db, {
      text,
      localDate,
      mealType: resolveMealType({ requested: meal_type, fromModel: estimate.meal.meal_type, localTime: time }),
      estimate,
      now: instant,
    });
    return c.json(entry satisfies Entry, 201);
  });

  api.get("/day/:date", (c) => {
    const date = parseDate(c.req.param("date"));
    if (!date) return c.json({ error: "invalid_date", reason: "Use YYYY-MM-DD or 'today', not in the future" }, 400);
    return c.json(getDay(db, date) satisfies DayResponse);
  });
  app.route("/api", api);
  // Registered before the SPA fallback so unknown API paths never get index.html.
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  if (webDist && fs.existsSync(webDist)) {
    const indexHtml = fs.readFileSync(path.join(webDist, "index.html"), "utf8");
    app.use("*", serveStatic({ root: webDist }));
    // SPA fallback: client-side routes like /day or /settings get index.html.
    app.get("*", (c) => c.html(indexHtml));
  }

  return app;
}
