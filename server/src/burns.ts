import { Hono } from "hono";
import {
  CreateBurnRequestSchema,
  UpdateBurnRequestSchema,
  type Burn,
  type DeleteBurnResponse,
} from "@calorie-tracker/shared";
import { asc, eq } from "drizzle-orm";
import type { ZodError } from "zod";
import { invalidDateBody, parseDateParam } from "./date-param.js";
import type { Db } from "./db/index.js";
import { burns } from "./db/schema.js";

type BurnRow = typeof burns.$inferSelect;

function toBurn(r: BurnRow): Burn {
  return { id: r.id, local_date: r.localDate, calories: r.calories, note: r.note, created_at: r.createdAt };
}

/** A day's burn entries, oldest first; `getDay` sums these into `totals.burned_kcal`. */
export function getBurns(db: Db, date: string): Burn[] {
  return db
    .select()
    .from(burns)
    .where(eq(burns.localDate, date))
    .orderBy(asc(burns.createdAt), asc(burns.id))
    .all()
    .map(toBurn);
}

/** The first validation problem as "field: message", for a readable 400. */
function firstIssue(error: ZodError) {
  const issue = error.issues[0]!;
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}

/** Blank notes are stored as no note. */
const cleanNote = (note: string | null | undefined) => note || null;

/** `POST /burns`, `PATCH`/`DELETE /burns/:id`, mounted under `/api`. */
export function burnRoutes(db: Db, now: () => Date) {
  const routes = new Hono();

  /** A positive integer id from the path; anything else can't match a row. */
  const parseId = (param: string) => (/^[1-9]\d*$/.test(param) ? Number(param) : null);
  const notFound = { error: "not_found", reason: "Burn not found" };
  const invalid = (reason: string) => ({ error: "invalid_request", reason });

  routes.post("/burns", async (c) => {
    const body = CreateBurnRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(invalid(firstIssue(body.error)), 400);
    const instant = now();
    // Defaults to today; null means the date is in the future.
    const localDate = parseDateParam(body.data.date ?? "today", instant);
    if (!localDate) return c.json(invalidDateBody, 400);

    const row = db
      .insert(burns)
      .values({
        localDate,
        calories: body.data.calories,
        note: cleanNote(body.data.note),
        createdAt: instant.toISOString(),
      })
      .returning()
      .get();
    return c.json(toBurn(row) satisfies Burn, 201);
  });

  routes.patch("/burns/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = UpdateBurnRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (id === null) return c.json(notFound, 404);
    if (!body.success) return c.json(invalid(firstIssue(body.error)), 400);
    const { calories, note } = body.data;
    const row = db
      .update(burns)
      .set({
        ...(calories !== undefined && { calories }),
        ...(note !== undefined && { note: cleanNote(note) }),
      })
      .where(eq(burns.id, id))
      .returning()
      .get();
    if (!row) return c.json(notFound, 404);
    return c.json(toBurn(row) satisfies Burn);
  });

  routes.delete("/burns/:id", (c) => {
    const id = parseId(c.req.param("id"));
    const row = id === null ? undefined : db.delete(burns).where(eq(burns.id, id)).returning().get();
    if (!row) return c.json(notFound, 404);
    return c.json({ local_date: row.localDate } satisfies DeleteBurnResponse);
  });

  return routes;
}
