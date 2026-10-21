import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createMealEstimator } from "./claude.js";
import { openDb } from "./db/index.js";
import { shutdown } from "./shutdown.js";

function fail(message: string): never {
  console.error(`\n[startup] FATAL: ${message}\n`);
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  fail("ANTHROPIC_API_KEY is not set. Put it in .env next to docker-compose.yml (see .env.example).");
}

const port = Number(process.env.PORT ?? 8080);
const databasePath = process.env.DATABASE_PATH ?? fileURLToPath(new URL("../../data/calories.db", import.meta.url));
const webDist = process.env.WEB_DIST ?? fileURLToPath(new URL("../../web/dist", import.meta.url));

let opened: ReturnType<typeof openDb>;
try {
  opened = openDb(databasePath);
} catch (err) {
  const code = (err as NodeJS.ErrnoException).code;
  const hint =
    code === "SQLITE_CANTOPEN" || code === "EACCES" || code === "SQLITE_READONLY"
      ? ` The process (uid ${process.getuid?.()}) can't write there. On the host, run: sudo chown -R 1000:1000 ./data`
      : "";
  fail(`could not open database at ${databasePath}: ${(err as Error).message}.${hint}`);
}

const { db, sqlite } = opened;
const app = createApp({ db, webDist, estimateMeal: createMealEstimator() });

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[startup] DB ${databasePath} (TZ=${process.env.TZ ?? "system"})`);
  console.log(`[startup] listening on http://0.0.0.0:${info.port}`);
});

// `docker stop` sends SIGTERM: finish in-flight requests, fold the WAL into calories.db, then exit.
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    console.log(`[shutdown] ${signal}: closing server and database`);
    shutdown({ server: server as Server, sqlite }).then(
      () => {
        console.log("[shutdown] done");
        process.exit(0);
      },
      (err) => {
        console.error("[shutdown] failed:", err);
        process.exit(1);
      },
    );
  });
}
