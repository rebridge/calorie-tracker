import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DayResponse, DeleteWeightResponse, PutWeightResponse } from "@calorie-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { openDb } from "./db/index.js";
import { weights } from "./db/schema.js";

let tmp: string;
let handle: ReturnType<typeof openDb>;
let app: ReturnType<typeof createApp>;
let clock: Date;
const prevTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/New_York";
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "calorie-tracker-weights-"));
  handle = openDb(path.join(tmp, "calories.db"));
  app = createApp({ db: handle.db, estimateMeal: () => Promise.reject(new Error("not used")), now: () => clock });
});

afterAll(() => {
  handle.sqlite.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (prevTz === undefined) delete process.env.TZ;
  else process.env.TZ = prevTz;
});

beforeEach(() => {
  handle.db.delete(weights).run();
  // 08:14 in New York on Tue Oct 13.
  clock = new Date("2026-10-13T12:14:00Z");
});

const put = (date: string, body: unknown) =>
  app.request(`/api/weights/${date}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const del = (date: string) => app.request(`/api/weights/${date}`, { method: "DELETE" });
const getDay = async (date: string) => (await (await app.request(`/api/day/${date}`)).json()) as DayResponse;
const rows = () => handle.db.select().from(weights).all();

describe("PUT /api/weights/:date", () => {
  it("saves the weight for today and returns it with the resolved date", async () => {
    const res = await put("today", { weight_lb: 182.4 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      local_date: "2026-10-13",
      weight_lb: 182.4,
      created_at: "2026-10-13T12:14:00.000Z",
    } satisfies PutWeightResponse);
    expect(rows()).toEqual([{ localDate: "2026-10-13", weightLb: 182.4, createdAt: "2026-10-13T12:14:00.000Z" }]);
  });

  it("replaces the same day's weight: one row, new value and created_at", async () => {
    await put("today", { weight_lb: 182.4 });
    clock = new Date("2026-10-13T20:00:00Z");
    // The explicit date and the `today` alias address the same row.
    const res = await put("2026-10-13", { weight_lb: 181.9 });
    expect(res.status).toBe(200);

    expect(rows()).toEqual([{ localDate: "2026-10-13", weightLb: 181.9, createdAt: "2026-10-13T20:00:00.000Z" }]);
    expect((await getDay("today")).weight).toEqual({ weight_lb: 181.9, created_at: "2026-10-13T20:00:00.000Z" });
  });

  it("accepts a past date and keeps days separate", async () => {
    await put("2026-10-01", { weight_lb: 185 });
    await put("today", { weight_lb: 182.4 });
    expect(rows()).toHaveLength(2);
    expect((await getDay("2026-10-01")).weight?.weight_lb).toBe(185);
    expect((await getDay("today")).weight?.weight_lb).toBe(182.4);
  });

  it("rejects a future date with 400 and saves nothing", async () => {
    const res = await put("2026-10-14", { weight_lb: 180 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_date");
    expect(rows()).toEqual([]);
  });

  it.each(["2026-02-30", "yesterday", "20261013"])("rejects malformed date %s with 400", async (date) => {
    expect((await put(date, { weight_lb: 180 })).status).toBe(400);
  });

  it.each([
    ["zero", { weight_lb: 0 }],
    ["negative", { weight_lb: -3 }],
    ["a string", { weight_lb: "182" }],
    ["null", { weight_lb: null }],
    ["missing", {}],
    ["not an object", [182]],
    ["not JSON", "not json"],
  ])("rejects an invalid weight (%s) with 400", async (_name, body) => {
    const res = await put("today", body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
    expect(rows()).toEqual([]);
  });

  it("keeps the old weight when a replacement is invalid", async () => {
    await put("today", { weight_lb: 182.4 });
    expect((await put("today", { weight_lb: -1 })).status).toBe(400);
    expect(rows()[0]?.weightLb).toBe(182.4);
  });
});

describe("DELETE /api/weights/:date", () => {
  it("deletes that day's weight and leaves other days alone", async () => {
    await put("today", { weight_lb: 182.4 });
    await put("2026-10-01", { weight_lb: 185 });

    const res = await del("today");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ local_date: "2026-10-13" } satisfies DeleteWeightResponse);
    expect((await getDay("today")).weight).toBeNull();
    expect((await getDay("2026-10-01")).weight?.weight_lb).toBe(185);
  });

  it("returns 404 when the day has no weight, including on a repeat delete", async () => {
    expect((await del("today")).status).toBe(404);
    await put("today", { weight_lb: 182.4 });
    expect((await del("2026-10-13")).status).toBe(200);
    const again = await del("2026-10-13");
    expect(again.status).toBe(404);
    expect(((await again.json()) as { error: string }).error).toBe("not_found");
  });

  it("rejects future and malformed dates with 400", async () => {
    expect((await del("2026-10-14")).status).toBe(400);
    expect((await del("nope")).status).toBe(400);
  });
});

describe("GET /api/day/:date weight", () => {
  it("is null until a weight is logged, then { weight_lb, created_at }", async () => {
    expect((await getDay("today")).weight).toBeNull();
    await put("today", { weight_lb: 182.4 });
    const day = await getDay("today");
    expect(day.weight).toEqual({ weight_lb: 182.4, created_at: "2026-10-13T12:14:00.000Z" });
    expect(day.date).toBe("2026-10-13");
  });
});

describe("GET /api/day/:date date param", () => {
  it.each(["2026-10-14", "2099-01-01", "2026-02-30", "yesterday", "20261013"])("rejects %s with 400", async (date) => {
    const res = await app.request(`/api/day/${date}`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_date");
  });
});
