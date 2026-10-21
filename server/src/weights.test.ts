import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DayResponse, DeleteWeightResponse, PutWeightResponse, WeightsResponse } from "@calorie-tracker/shared";
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

describe("GET /api/weights", () => {
  const getTrend = async (query = "") => {
    const res = await app.request(`/api/weights${query}`);
    return { res, body: (await res.json()) as WeightsResponse };
  };
  const seed = async (readings: [string, number][]) => {
    for (const [date, weight_lb] of readings) await put(date, { weight_lb });
  };

  it("is empty but still names the range's end when there are no weights", async () => {
    const { res, body } = await getTrend();
    expect(res.status).toBe(200);
    expect(body).toEqual({ range: "30d", from: "2026-09-13", today: "2026-10-13", points: [], moving_avg: [] });
  });

  it("defaults to 30d, and each range starts that many days before today", async () => {
    expect((await getTrend()).body.range).toBe("30d");
    expect((await getTrend("?range=30d")).body.from).toBe("2026-09-13");
    expect((await getTrend("?range=90d")).body.from).toBe("2026-07-15");
    expect((await getTrend("?range=1y")).body.from).toBe("2025-10-13");
    for (const range of ["30d", "90d", "1y"]) expect((await getTrend(`?range=${range}`)).body.today).toBe("2026-10-13");
  });

  it.each(["7d", "30", "", "all", "1Y"])("rejects range=%j with 400", async (range) => {
    const res = await app.request(`/api/weights?range=${range}`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe("invalid_request");
    expect(body.reason).toContain("range");
  });

  it("takes today from the server's TZ, not UTC", async () => {
    clock = new Date("2026-10-14T02:30:00Z"); // still Oct 13 in New York
    expect((await getTrend()).body.today).toBe("2026-10-13");
  });

  it("returns points oldest first, only from the range start through today", async () => {
    await seed([
      ["2026-10-13", 182],
      ["2026-09-13", 186], // exactly 30 days back: in
      ["2026-09-12", 187], // one day too early: out of the points
      ["2026-09-30", 184],
    ]);
    const { body } = await getTrend("?range=30d");
    expect(body.points).toEqual([
      { date: "2026-09-13", weight_lb: 186 },
      { date: "2026-09-30", weight_lb: 184 },
      { date: "2026-10-13", weight_lb: 182 },
    ]);
    // A longer range picks the older reading up.
    expect((await getTrend("?range=90d")).body.points.map((p) => p.date)).toEqual([
      "2026-09-12",
      "2026-09-13",
      "2026-09-30",
      "2026-10-13",
    ]);
  });

  it("gives the first point a full average from the 6 days before the range", async () => {
    await seed([
      ["2026-09-06", 190], // 7 days before the range start: outside the first window
      ["2026-09-07", 188], // lead-in: the window for Sep 13 is Sep 7-13
      ["2026-09-10", 186],
      ["2026-09-13", 184], // first day of the 30d range
      ["2026-09-14", 183],
    ]);
    const { body } = await getTrend("?range=30d");
    expect(body.points.map((p) => p.date)).toEqual(["2026-09-13", "2026-09-14"]);
    // Sep 13 averages Sep 7, 10, 13 = 186; Sep 14 (window Sep 8-14) averages 186, 184, 183.
    expect(body.moving_avg).toEqual([
      { date: "2026-09-13", avg_lb: 186 },
      { date: "2026-09-14", avg_lb: 184.33 },
    ]);
  });

  it("has one average per point, on the same dates", async () => {
    await seed([
      ["2026-10-01", 185],
      ["2026-10-05", 184],
      ["2026-10-13", 182],
    ]);
    const { body } = await getTrend();
    expect(body.moving_avg.map((p) => p.date)).toEqual(body.points.map((p) => p.date));
  });

  it("reflects an edited or deleted weight immediately", async () => {
    await seed([["2026-10-13", 182]]);
    await put("today", { weight_lb: 181 });
    expect((await getTrend()).body.points).toEqual([{ date: "2026-10-13", weight_lb: 181 }]);
    await del("today");
    expect((await getTrend()).body.points).toEqual([]);
  });
});
