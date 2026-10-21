import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "./db/index.js";
import { shutdown } from "./shutdown.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shutdown-"));
  dirs.push(dir);
  const file = path.join(dir, "calories.db");
  return { file, ...openDb(file) };
}

const listen = (server: http.Server) => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

describe("shutdown", () => {
  it("checkpoints the WAL into the database file and closes the database", async () => {
    const { file, sqlite } = tempDb();
    sqlite.exec("create table probe (n integer); insert into probe values (1), (2), (3);");
    expect(fs.statSync(`${file}-wal`).size).toBeGreaterThan(0);

    const server = http.createServer();
    await listen(server);
    await shutdown({ server, sqlite });

    expect(sqlite.open).toBe(false);
    expect(fs.existsSync(`${file}-wal`) ? fs.statSync(`${file}-wal`).size : 0).toBe(0);
    // The main file alone now holds everything.
    const copy = path.join(path.dirname(file), "copy.db");
    fs.copyFileSync(file, copy);
    const reopened = openDb(copy);
    expect(reopened.sqlite.prepare("select count(*) as c from probe").get()).toEqual({ c: 3 });
    reopened.sqlite.close();
  });

  it("stops listening and force-closes a request that outlasts the drain timeout", async () => {
    const { sqlite } = tempDb();
    const server = http.createServer(() => {
      /* never responds */
    });
    await listen(server);
    const { port } = server.address() as { port: number };
    const failed = new Promise<string>((resolve) => {
      http.get({ port, host: "127.0.0.1" }).on("error", (err) => resolve((err as NodeJS.ErrnoException).code ?? err.message));
    });
    await new Promise((r) => setTimeout(r, 50));

    await shutdown({ server, sqlite }, 100);

    expect(await failed).toBe("ECONNRESET");
    expect(server.listening).toBe(false);
    expect(sqlite.open).toBe(false);
  });
});
