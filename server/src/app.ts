import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  CreateEntryRequestSchema,
  LocalDateSchema,
  UpdateEntryRequestSchema,
  UpdateItemRequestSchema,
  type DayResponse,
  type DeleteEntryResponse,
  type DeleteItemResponse,
  type Entry,
  type HealthResponse,
  type UpdateEntryResponse,
  type UpdateItemResponse,
} from "@calorie-tracker/shared";
import { sql } from "drizzle-orm";
import { burnRoutes } from "./burns.js";
import { ModelError, type Estimate, type MealEstimator } from "./claude.js";
import type { Db } from "./db/index.js";
import { createEntry, deleteEntry, deleteItem, getDay, updateEntry, updateItem } from "./entries.js";
import { resolveMealType } from "./meal-type.js";
import { settingsRoutes } from "./settings.js";
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
    let estimate: Estimate;
    try {
      estimate = await estimateMeal({ text, localTime: time });
    } catch (err) {
      const failure = err instanceof ModelError ? err : new ModelError("api_error", "The model call failed", {}, { cause: err });
      console.error("[entries] model error, nothing saved", {
        kind: failure.kind,
        reason: failure.message,
        ...failure.context,
        text,
        local_date: localDate,
        ...(failure.cause instanceof Error && { cause: failure.cause.message }),
      });
      return c.json({ error: "model_error", reason: failure.message }, 502);
    }

    const { items, not_food_reason } = estimate.meal;
    if (items.length === 0 || not_food_reason) {
      const reason = not_food_reason ?? "No food or drink found";
      console.warn("[entries] not food, nothing saved", { reason, text, local_date: localDate });
      return c.json({ error: "not_food", reason }, 422);
    }

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
  /** A positive integer id from the path; anything else can't match a row. */
  const parseId = (param: string) => (/^[1-9]\d*$/.test(param) ? Number(param) : null);
  const notFound = (what: string) => ({ error: "not_found", reason: `${what} not found` });
  const invalid = (reason: string) => ({ error: "invalid_request", reason });

  api.patch("/items/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = UpdateItemRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (id === null) return c.json(notFound("Item"), 404);
    if (!body.success) return c.json(invalid(body.error.message), 400);
    const result = updateItem(db, id, body.data);
    if (!result) return c.json(notFound("Item"), 404);
    return c.json(result satisfies UpdateItemResponse);
  });

  api.delete("/items/:id", (c) => {
    const id = parseId(c.req.param("id"));
    const result = id === null ? undefined : deleteItem(db, id);
    if (!result) return c.json(notFound("Item"), 404);
    return c.json(result satisfies DeleteItemResponse);
  });

  api.patch("/entries/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = UpdateEntryRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (id === null) return c.json(notFound("Entry"), 404);
    if (!body.success) return c.json(invalid(body.error.message), 400);
    const result = updateEntry(db, id, body.data);
    if (!result) return c.json(notFound("Entry"), 404);
    return c.json(result satisfies UpdateEntryResponse);
  });

  api.delete("/entries/:id", (c) => {
    const id = parseId(c.req.param("id"));
    const result = id === null ? undefined : deleteEntry(db, id);
    if (!result) return c.json(notFound("Entry"), 404);
    return c.json(result satisfies DeleteEntryResponse);
  });

  api.route("/", burnRoutes(db, now));
  api.route("/", settingsRoutes(db));
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
