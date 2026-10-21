import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BurnSchema, DayResponseSchema, remainingKcal, type Burn, type DayResponse, type Meal } from "@calorie-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { MealEstimator } from "./claude.js";
import { openDb } from "./db/index.js";
import { burns, entries } from "./db/schema.js";

const lunch: Meal = {
  meal_type: "lunch",
  items: [{ name: "Burrito", portion: "1", calories: 800, protein_g: 30, carbs_g: 90, fat_g: 30, confidence: "high", assumption: null }],
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "calorie-tracker-"));
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

const logBurn = async (body: unknown) => (await (await send("POST", "/api/burns", body)).json()) as Burn;
const getDay = async (date = "today") => (await (await send("GET", `/api/day/${date}`)).json()) as DayResponse;
const rows = () => handle.db.select().from(burns).all();

describe("POST /api/burns", () => {
  it("defaults to today (from TZ, not UTC) and stamps created_at", async () => {
    // 22:00 on Oct 13 in New York is already Oct 14 in UTC.
    clock = new Date("2026-10-14T02:00:00Z");
    const res = await send("POST", "/api/burns", { calories: 300, note: "evening run" });
    expect(res.status).toBe(201);
    const burn = BurnSchema.parse(await res.json());
    expect(burn).toEqual({
      id: expect.any(Number),
      local_date: "2026-10-13",
      calories: 300,
      note: "evening run",
      created_at: "2026-10-14T02:00:00.000Z",
    });
    expect(rows()).toHaveLength(1);
  });

  it("saves to an explicit past date, and to today", async () => {
    expect((await logBurn({ calories: 250, date: "2026-10-05" })).local_date).toBe("2026-10-05");
    expect((await logBurn({ calories: 100, date: "2026-10-13" })).local_date).toBe("2026-10-13");
    expect((await getDay("2026-10-05")).burns.map((b) => b.calories)).toEqual([250]);
    expect((await getDay("today")).burns.map((b) => b.calories)).toEqual([100]);
  });

  it("rejects a future date with 400 and saves nothing", async () => {
    const res = await send("POST", "/api/burns", { calories: 300, date: "2026-10-14" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
    expect(rows()).toEqual([]);
  });

  it("judges the future by the server's local day", async () => {
    // Still Oct 13 in New York, so Oct 14 is tomorrow even though UTC is already on Oct 14.
    clock = new Date("2026-10-14T02:00:00Z");
    expect((await send("POST", "/api/burns", { calories: 50, date: "2026-10-14" })).status).toBe(400);
    expect((await send("POST", "/api/burns", { calories: 50, date: "2026-10-13" })).status).toBe(201);
  });

  it("stores a blank or missing note as null", async () => {
    expect((await logBurn({ calories: 100 })).note).toBeNull();
    expect((await logBurn({ calories: 100, note: "   " })).note).toBeNull();
    expect((await logBurn({ calories: 100, note: null })).note).toBeNull();
    expect((await logBurn({ calories: 100, note: "  swim " })).note).toBe("swim");
  });

  it.each([
    {},
    { calories: 0 },
    { calories: -5 },
    { calories: 12.5 },
    { calories: "300" },
    { calories: null },
    { calories: 300, note: 5 },
    { calories: 300, note: "x".repeat(201) },
    { calories: 300, date: "tomorrow" },
    { calories: 300, date: "2026-02-30" },
  ])("rejects %j with 400", async (body) => {
    const res = await send("POST", "/api/burns", body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
    expect(rows()).toEqual([]);
  });

  it("rejects a body that isn't JSON with 400", async () => {
    expect((await app.request("/api/burns", { method: "POST", body: "nope" })).status).toBe(400);
  });
});

describe("PATCH /api/burns/:id", () => {
  it("edits calories and note, keeping local_date and created_at", async () => {
    const burn = await logBurn({ calories: 300, note: "run" });
    clock = new Date("2026-10-13T20:00:00Z");

    const res = await send("PATCH", `/api/burns/${burn.id}`, { calories: 450, note: "long run" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...burn, calories: 450, note: "long run" });
    expect((await getDay()).totals.burned_kcal).toBe(450);
  });

  it("changes only the fields given, and clears the note with a blank", async () => {
    const burn = await logBurn({ calories: 300, note: "run" });
    expect(((await (await send("PATCH", `/api/burns/${burn.id}`, { calories: 320 })).json()) as Burn)).toMatchObject({
      calories: 320,
      note: "run",
    });
    expect(((await (await send("PATCH", `/api/burns/${burn.id}`, { note: "" })).json()) as Burn)).toMatchObject({
      calories: 320,
      note: null,
    });
  });

  it("works on a past day's burn", async () => {
    const burn = await logBurn({ calories: 200, date: "2026-10-05" });
    const res = await send("PATCH", `/api/burns/${burn.id}`, { calories: 220 });
    expect(((await res.json()) as Burn).local_date).toBe("2026-10-05");
    expect((await getDay("2026-10-05")).totals.burned_kcal).toBe(220);
  });

  it("returns 404 for a missing burn", async () => {
    const res = await send("PATCH", "/api/burns/9999", { calories: 10 });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", reason: "Burn not found" });
  });

  it.each(["abc", "0", "-1", "1.5"])("returns 404 for the id %s", async (id) => {
    expect((await send("PATCH", `/api/burns/${id}`, { calories: 10 })).status).toBe(404);
  });

  it.each([{}, { calories: 0 }, { calories: -1 }, { calories: 1.5 }, { calories: "10" }, { note: 5 }])(
    "rejects %j with 400 and changes nothing",
    async (body) => {
      const burn = await logBurn({ calories: 300, note: "run" });
      const res = await send("PATCH", `/api/burns/${burn.id}`, body);
      expect(res.status).toBe(400);
      expect(rows()[0]).toMatchObject({ calories: 300, note: "run" });
    },
  );
});

describe("DELETE /api/burns/:id", () => {
  it("deletes the burn and says which day it was on", async () => {
    const keep = await logBurn({ calories: 100 });
    const gone = await logBurn({ calories: 300, date: "2026-10-05" });

    const res = await send("DELETE", `/api/burns/${gone.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ local_date: "2026-10-05" });
    expect(rows().map((r) => r.id)).toEqual([keep.id]);
    expect((await getDay("2026-10-05")).burns).toEqual([]);
  });

  it("returns 404 for a missing burn and for a second delete", async () => {
    const burn = await logBurn({ calories: 300 });
    expect((await send("DELETE", `/api/burns/${burn.id}`)).status).toBe(200);
    const again = await send("DELETE", `/api/burns/${burn.id}`);
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: "not_found", reason: "Burn not found" });
    expect((await send("DELETE", "/api/burns/abc")).status).toBe(404);
  });
});

describe("GET /api/day/:date with burns", () => {
  it("lists burns oldest first and sums them into burned_kcal", async () => {
    await logBurn({ calories: 300, note: "run" });
    clock = new Date("2026-10-13T22:00:00Z");
    await logBurn({ calories: 120 });
    await logBurn({ calories: 999, date: "2026-10-12" });

    const day = DayResponseSchema.parse(await getDay());
    expect(day.burns.map((b) => [b.calories, b.note])).toEqual([
      [300, "run"],
      [120, null],
    ]);
    expect(day.totals.burned_kcal).toBe(420);
  });

  it("makes Remaining go up by the burned calories", async () => {
    await send("POST", "/api/entries", { text: "burrito" });
    const budget = (day: DayResponse) =>
      remainingKcal({ goal: day.goals.calorie_goal, eaten: day.totals.eaten_kcal, burned: day.totals.burned_kcal });

    const before = await getDay();
    expect(budget(before)).toBe(2000 - 800);

    const burn = await logBurn({ calories: 300 });
    const after = await getDay();
    expect(after.totals).toMatchObject({ eaten_kcal: 800, burned_kcal: 300 });
    expect(budget(after)).toBe(budget(before) + 300);

    await send("DELETE", `/api/burns/${burn.id}`);
    expect(budget(await getDay())).toBe(budget(before));
  });

  it("keeps burns out of the meal groups", async () => {
    await logBurn({ calories: 300 });
    const day = await getDay();
    expect(day.meals.every((m) => m.entries.length === 0 && m.calories === 0)).toBe(true);
    expect(day.totals.eaten_kcal).toBe(0);
  });

  it("is empty with zero burned on a day without burns", async () => {
    const day = await getDay("2026-10-01");
    expect(day.burns).toEqual([]);
    expect(day.totals.burned_kcal).toBe(0);
  });
});
