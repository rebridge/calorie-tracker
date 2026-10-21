import type { Server } from "node:http";
import type { Database } from "better-sqlite3";

/** Docker sends SIGKILL 10s after SIGTERM, so give in-flight requests a little under that. */
const DRAIN_TIMEOUT_MS = 8_000;

/**
 * Stops accepting requests, lets in-flight ones finish (up to `drainTimeoutMs`), then checkpoints the WAL
 * into the main database file and closes it. Resolves once the database is closed; the caller exits.
 */
export async function shutdown(
  { server, sqlite }: { server: Pick<Server, "close" | "closeIdleConnections" | "closeAllConnections">; sqlite: Database },
  drainTimeoutMs = DRAIN_TIMEOUT_MS,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      server.closeAllConnections();
      resolve();
    }, drainTimeoutMs);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
    // Keep-alive connections would otherwise hold close() open until they time out.
    server.closeIdleConnections();
  });

  try {
    // TRUNCATE folds the WAL into calories.db and empties calories.db-wal, so a plain copy of the file is complete.
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    sqlite.close();
  }
}
