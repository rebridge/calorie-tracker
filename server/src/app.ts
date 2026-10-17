import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { HealthResponse } from "@calorie-tracker/shared";
import { sql } from "drizzle-orm";
import type { Db } from "./db/index.js";

export function createApp({ db, webDist }: { db: Db; webDist?: string }) {
  const app = new Hono();

  const api = new Hono();
  api.get("/health", (c) => {
    db.run(sql`select 1`);
    return c.json({ ok: true } satisfies HealthResponse);
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
