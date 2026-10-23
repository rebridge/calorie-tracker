import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CaloriesResponse, Entry, Meal } from "@calorie-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { MealEstimator } from "./claude.js";
import { openDb } from "./db/index.js";
import { burns, entries } from "./db/schema.js";

const lunch: Meal = {
  meal_type: "lunch",
  items: [
    { name: "Burrito", portion: "1", calories: 800, protein_g: 30, carbs_g: 90, fat_g: 30, confidence: "high", assumption: null },
    { name: "Soda", portion: "1 can", calories: 150, protein_g: 0, carbs_g: 39, fat_g: 0, confidence: "high", assumption: null },
  ],
  not_food_reason: null,
};

let tmp: string;
let handle: ReturnType<typeof openDb>;
let clock: Date;
const estimateMeal = vi.fn<MealEstimator>(async () => ({
  meal: lunch,
  model: "claude-haiku-5-5",
  response: { id: "msg_test" },
  inputTokens: 400,
  outputTokens: 250,
}));
let app: ReturnType<typeof createApp>;
const prevTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/New_York";
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "calorie-tracker-calories-"));
  handle = openDb(path.join(tmp, "calories.db"));
  app = createApp({ db: handle.db, estimateMeal, now: () => clock });
});

afterAll(() => {
  handle.sqlite.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (prevTz === undefined) delete process.env.TZ;
  else process.env.TZ = prevTz;
});

beforeEach(() => {
  handle.db.delete(burns).run();
  handle.db.delete(entries).run();
  // 08:14 in New York on Tue Oct 13.
  clock = new Date("2026-10-13T12:14:00Z");
});

const send = (method: string, url: string, body?: unknown) =>
  app.request(url, {
    method,
    ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
const logMeal = async (date?: string) => (await (await send("POST", "/api/entries", { text: "lunch", date })).json()) as Entry;
const logBurn = (calories: number, date?: string) => send("POST", "/api/burns", { calories, date });
const getCalories = async (range?: string) =>
  (await (await send("GET", `/api/calories${range ? `?range=${range}` : ""}`)).json()) as CaloriesResponse;

describe("GET /api/calories", () => {
  it("is empty but still names the range when nothing is logged", async () => {
    expect(await getCalories()).toEqual({ range: "30d", from: "2026-09-13", today: "2026-10-13", points: [] });
  });

  it("starts each range that many days before today", async () => {
    expect((await getCalories("90d")).from).toBe("2026-07-15");
    expect((await getCalories("1y")).from).toBe("2025-10-13");
  });

  it("rejects an unknown range with 400", async () => {
    const res = await send("GET", "/api/calories?range=7d");
    expect(res.status).toBe(400);
  });

  it("sums eaten and burned per day, oldest first, with 0 for the missing side", async () => {
    await logMeal("2026-10-12");
    await logMeal("2026-10-12");
    await logBurn(300, "2026-10-12");
    await logBurn(200, "2026-10-12");
    await logMeal();
    await logBurn(450, "2026-10-01");

    expect((await getCalories()).points).toEqual([
      { date: "2026-10-01", eaten_kcal: 0, burned_kcal: 450 },
      { date: "2026-10-12", eaten_kcal: 1900, burned_kcal: 500 },
      { date: "2026-10-13", eaten_kcal: 950, burned_kcal: 0 },
    ]);
  });

  it("leaves out days before the range start", async () => {
    await logMeal("2026-09-12");
    await logBurn(100, "2026-09-12");
    await logMeal("2026-09-13");
    expect((await getCalories()).points.map((p) => p.date)).toEqual(["2026-09-13"]);
  });

  it("reflects a deleted entry immediately", async () => {
    const entry = await logMeal();
    await send("DELETE", `/api/entries/${entry.id}`);
    expect((await getCalories()).points).toEqual([]);
  });
});
