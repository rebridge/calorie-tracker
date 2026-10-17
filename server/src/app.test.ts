import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { openDb } from "./db/index.js";
import { settings } from "./db/schema.js";

let tmp: string;
let handle: ReturnType<typeof openDb>;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "calorie-tracker-"));
  const webDist = path.join(tmp, "web");
  fs.mkdirSync(webDist);
  fs.writeFileSync(path.join(webDist, "index.html"), "<!doctype html><div id=root></div>");
  fs.writeFileSync(path.join(webDist, "app.js"), "console.log('hi')");

  handle = openDb(path.join(tmp, "data", "calories.db"));
  app = createApp({
    db: handle.db,
    webDist,
    estimateMeal: () => Promise.reject(new Error("not used")),
  });
});

afterAll(() => {
  handle.sqlite.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("db", () => {
  it("runs migrations and seeds the default goals", () => {
    expect(handle.db.select().from(settings).all()).toEqual([
      { id: 1, calorieGoal: 2000, proteinGoalG: 150, carbsGoalG: 200, fatGoalG: 65 },
    ]);
  });

  it("uses WAL mode", () => {
    expect(handle.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("is idempotent across restarts", () => {
    const again = openDb(handle.sqlite.name);
    expect(again.db.select().from(settings).all()).toHaveLength(1);
    again.sqlite.close();
  });
});

describe("app", () => {
  it("GET /api/health", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("unknown /api routes 404 as JSON, not the SPA", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("serves static files", async () => {
    const res = await app.request("/app.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("hi");
  });

  it.each(["/", "/day", "/day/2026-10-13", "/settings"])("falls back to index.html for %s", async (url) => {
    const res = await app.request(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id=root>');
  });
});
