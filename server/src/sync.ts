import { Hono } from "hono";
import {
  ClientIdSchema,
  SyncBurnRequestSchema,
  SyncEntryRequestSchema,
  type Burn,
  type Entry,
} from "@calorie-tracker/shared";
import { eq } from "drizzle-orm";
import { cleanNote, toBurn } from "./burns.js";
import { invalidDateBody, parseDateParam } from "./date-param.js";
import type { Db } from "./db/index.js";
import { burns } from "./db/schema.js";
import { upsertSyncedEntry } from "./entries.js";
import { firstIssue } from "./first-issue.js";

/**
 * `PUT /sync/entries/:client_id` and `PUT /sync/burns/:client_id`, mounted under `/api`: uploads from the iOS app,
 * which saves entries and burns while it can't reach the server. Keyed by the phone's id for the record, so a
 * retried upload updates the row it already made instead of adding another.
 */
export function syncRoutes(db: Db, now: () => Date) {
  const routes = new Hono();

  const invalid = (reason: string) => ({ error: "invalid_request", reason });
  /** `logged_at` becomes `created_at`; a phone clock running ahead is clamped to now. */
  const createdAt = (loggedAt: string, serverNow: Date) => {
    const logged = new Date(loggedAt);
    return logged < serverNow ? logged : serverNow;
  };

  routes.put("/sync/entries/:client_id", async (c) => {
    const clientId = ClientIdSchema.safeParse(c.req.param("client_id"));
    if (!clientId.success) return c.json(invalid("client_id: must be a UUID"), 400);
    const body = SyncEntryRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(invalid(firstIssue(body.error)), 400);
    const serverNow = now();
    const localDate = parseDateParam(body.data.date, serverNow);
    if (!localDate) return c.json(invalidDateBody, 400);

    const { entry, created } = upsertSyncedEntry(db, clientId.data, {
      body: body.data,
      localDate,
      createdAt: createdAt(body.data.logged_at, serverNow),
    });
    return c.json(entry satisfies Entry, created ? 201 : 200);
  });

  routes.put("/sync/burns/:client_id", async (c) => {
    const clientId = ClientIdSchema.safeParse(c.req.param("client_id"));
    if (!clientId.success) return c.json(invalid("client_id: must be a UUID"), 400);
    const body = SyncBurnRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(invalid(firstIssue(body.error)), 400);
    const serverNow = now();
    const localDate = parseDateParam(body.data.date, serverNow);
    if (!localDate) return c.json(invalidDateBody, 400);

    const { calories, note } = body.data;
    const updated = db
      .update(burns)
      .set({ calories, note: cleanNote(note) })
      .where(eq(burns.clientId, clientId.data))
      .returning()
      .get();
    if (updated) return c.json(toBurn(updated) satisfies Burn, 200);
    const row = db
      .insert(burns)
      .values({
        localDate,
        calories,
        note: cleanNote(note),
        createdAt: createdAt(body.data.logged_at, serverNow).toISOString(),
        clientId: clientId.data,
      })
      .returning()
      .get();
    return c.json(toBurn(row) satisfies Burn, 201);
  });

  return routes;
}
