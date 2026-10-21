import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DayResponseSchema, type DayResponse, type Entry, type Meal } from "@calorie-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { ModelError, type MealEstimator } from "./claude.js";
import { openDb } from "./db/index.js";
import { entries, entryItems, settings } from "./db/schema.js";

const item = (name: string, calories: number, p: number, c: number, f: number) => ({
  name,
  portion: "1 serving",
  calories,
  protein_g: p,
  carbs_g: c,
  fat_g: f,
  confidence: "high" as const,
  assumption: null,
});

const breakfast: Meal = {
  meal_type: "breakfast",
  items: [
    item("Scrambled eggs", 182, 12.6, 1.2, 13.8),
    { ...item("Flour tortilla", 218.4, 5.8, 36.2, 5.4), confidence: "medium", assumption: "Assumed 10-inch flour tortilla" },
    item("Black coffee", 2, 0.3, 0, 0),
  ],
  not_food_reason: null,
};

let tmp: string;
let handle: ReturnType<typeof openDb>;
let clock: Date;
let nextMeal: Meal;
const estimateMeal = vi.fn<MealEstimator>(async () => ({
  meal: nextMeal,
  model: "claude-haiku-5-5",
  response: { id: "msg_test", parsed_output: nextMeal },
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
  handle.db.delete(entries).run();
  estimateMeal.mockClear();
  // 08:14 in New York on Tue Oct 13.
  clock = new Date("2026-10-13T12:14:00Z");
  nextMeal = breakfast;
});

const post = (body: unknown) =>
  app.request("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const getDay = async (date: string) => {
  const res = await app.request(`/api/day/${date}`);
  return { status: res.status, body: (await res.json()) as DayResponse };
};

describe("POST /api/entries", () => {
  it("estimates, saves and returns the entry with its items", async () => {
    const res = await post({ text: "2 eggs in a wrap with black coffee for breakfast" });
    expect(res.status).toBe(201);
    const entry = (await res.json()) as Entry;

    expect(estimateMeal).toHaveBeenCalledWith({
      text: "2 eggs in a wrap with black coffee for breakfast",
      localTime: "08:14",
    });
    expect(entry).toMatchObject({
      local_date: "2026-10-13",
      meal_type: "breakfast",
      raw_text: "2 eggs in a wrap with black coffee for breakfast",
      calories: 182 + 218 + 2,
      protein_g: 18.7,
      carbs_g: 37.4,
      fat_g: 19.2,
    });
    expect(entry.items.map((i) => i.name)).toEqual(["Scrambled eggs", "Flour tortilla", "Black coffee"]);
    expect(entry.items[1]).toMatchObject({
      calories: 218,
      confidence: "medium",
      assumption: "Assumed 10-inch flour tortilla",
      edited: false,
    });
  });

  it("stores the audit trail on the entry row", async () => {
    await post({ text: "breakfast" });
    const [row] = handle.db.select().from(entries).all();
    expect(row).toMatchObject({
      rawText: "breakfast",
      model: "claude-haiku-5-5",
      inputTokens: 400,
      outputTokens: 250,
      localDate: "2026-10-13",
      createdAt: "2026-10-13T12:14:00.000Z",
    });
    expect(JSON.parse(row!.modelResponse)).toEqual({ id: "msg_test", parsed_output: breakfast });
    expect(handle.db.select().from(entryItems).all()).toHaveLength(3);
  });

  it("stores raw_text exactly as typed, untrimmed", async () => {
    const text = "  2 eggs\n";
    const entry = (await (await post({ text })).json()) as Entry;
    expect(entry.raw_text).toBe(text);
    expect(handle.db.select().from(entries).all()[0]!.rawText).toBe(text);
  });

  it("floors negative numbers from the model at 0 and keeps the raw response", async () => {
    nextMeal = { ...breakfast, items: [item("Weird", -50, -1, -2.5, -0.1), item("Fine", 10, 1, 1, 1)] };
    const entry = (await (await post({ text: "weird" })).json()) as Entry;
    expect(entry.items[0]).toMatchObject({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(entry).toMatchObject({ calories: 10, protein_g: 1, carbs_g: 1, fat_g: 1 });
    const [row] = handle.db.select().from(entries).all();
    expect(JSON.parse(row!.modelResponse).parsed_output.items[0].calories).toBe(-50);
  });

  it("falls back to the time of day when no meal is mentioned", async () => {
    nextMeal = { ...breakfast, meal_type: null };
    clock = new Date("2026-10-13T22:05:00Z"); // 18:05 local
    const entry = (await (await post({ text: "pasta" })).json()) as Entry;
    expect(entry.meal_type).toBe("dinner");
  });

  it("lets the request's meal_type override Claude's", async () => {
    const entry = (await (await post({ text: "eggs", meal_type: "snack" })).json()) as Entry;
    expect(entry.meal_type).toBe("snack");
  });

  it("uses the server's local date across UTC midnight", async () => {
    clock = new Date("2026-10-14T02:30:00Z"); // 22:30 on Oct 13 in New York
    const entry = (await (await post({ text: "late snack" })).json()) as Entry;
    expect(entry.local_date).toBe("2026-10-13");
  });

  it.each([{}, { text: "" }, { text: "   " }, { text: "x", meal_type: "brunch" }])("rejects %j with 400", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(estimateMeal).not.toHaveBeenCalled();
  });

  it("sends today's local time to the model, and no date label", async () => {
    await post({ text: "eggs", date: "2026-10-13" });
    expect(estimateMeal).toHaveBeenCalledWith({ text: "eggs", localTime: "08:14" });
  });
});

describe("POST /api/entries backdated", () => {
  it("saves to the given past date with created_at = now and the requested meal_type", async () => {
    const res = await post({ text: "chicken burrito", date: "2026-10-12", meal_type: "lunch" });
    expect(res.status).toBe(201);
    const entry = (await res.json()) as Entry;
    expect(entry).toMatchObject({ local_date: "2026-10-12", meal_type: "lunch", raw_text: "chicken burrito" });
    expect(entry.created_at).toBe("2026-10-13T12:14:00.000Z");

    const [row] = handle.db.select().from(entries).all();
    expect(row).toMatchObject({ localDate: "2026-10-12", createdAt: "2026-10-13T12:14:00.000Z" });
    expect((await getDay("2026-10-12")).body.meals.find((m) => m.meal_type === "lunch")?.entries).toHaveLength(1);
    expect((await getDay("2026-10-13")).body.totals.eaten_kcal).toBe(0);
  });

  it("tells the model the day, never a local time", async () => {
    await post({ text: "chicken burrito", date: "2026-10-12" });
    expect(estimateMeal).toHaveBeenCalledWith({ text: "chicken burrito", pastDay: "Mon, Oct 12" });
    expect(estimateMeal.mock.calls[0]![0]).not.toHaveProperty("localTime");
  });

  it("includes the year for a day in another year", async () => {
    await post({ text: "stew", date: "2025-12-31" });
    expect(estimateMeal).toHaveBeenCalledWith({ text: "stew", pastDay: "Wed, Dec 31, 2025" });
  });

  it("uses Claude's meal_type when none is requested", async () => {
    const entry = (await (await post({ text: "eggs for breakfast", date: "2026-10-12" })).json()) as Entry;
    expect(entry.meal_type).toBe("breakfast");
  });

  it("falls back to snack, not the time of day, when nothing names the meal", async () => {
    nextMeal = { ...breakfast, meal_type: null }; // 08:14 now would be breakfast
    const entry = (await (await post({ text: "pasta", date: "2026-10-12" })).json()) as Entry;
    expect(entry.meal_type).toBe("snack");
  });

  it("lets the request's meal_type override Claude's", async () => {
    const entry = (await (await post({ text: "eggs", date: "2026-10-12", meal_type: "dinner" })).json()) as Entry;
    expect(entry.meal_type).toBe("dinner");
  });

  it("accepts today's date as today", async () => {
    const res = await post({ text: "x", date: "2026-10-13" });
    expect(res.status).toBe(201);
    expect(((await res.json()) as Entry).local_date).toBe("2026-10-13");
  });

  it("compares the date with the server's local today across UTC midnight", async () => {
    clock = new Date("2026-10-14T02:30:00Z"); // 22:30 on Oct 13 in New York
    expect((await post({ text: "x", date: "2026-10-13" })).status).toBe(201);
    expect((await post({ text: "x", date: "2026-10-14" })).status).toBe(400);
  });

  it.each(["2026-10-14", "2027-01-01", "2026-02-30", "yesterday", "today"])("rejects date %j with 400 and calls no model", async (date) => {
    const res = await post({ text: "x", date });
    expect(res.status).toBe(400);
    expect(estimateMeal).not.toHaveBeenCalled();
    expect(handle.db.select().from(entries).all()).toHaveLength(0);
  });

  it("still rejects a backdated non-food submission with 422 and saves nothing", async () => {
    nextMeal = { meal_type: null, items: [], not_food_reason: "That's an exercise" };
    expect((await post({ text: "ran 3 miles", date: "2026-10-12" })).status).toBe(422);
    expect(handle.db.select().from(entries).all()).toHaveLength(0);
  });
});

describe("POST /api/entries failures", () => {
  const rowCounts = () => ({
    entries: handle.db.select().from(entries).all().length,
    items: handle.db.select().from(entryItems).all().length,
  });

  let errorLog: ReturnType<typeof vi.spyOn>;
  let warnLog: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    return () => {
      errorLog.mockRestore();
      warnLog.mockRestore();
    };
  });

  it.each([
    ["hello", { meal_type: null, items: [], not_food_reason: "That's a greeting, not food." }, "That's a greeting, not food."],
    ["ran 3 miles", { meal_type: null, items: [], not_food_reason: "That's exercise, not food." }, "That's exercise, not food."],
    ["???", { meal_type: null, items: [], not_food_reason: null }, "No food or drink found"],
    // A reason wins even if the model also listed items.
    ["hello", { ...breakfast, not_food_reason: "Not a meal." }, "Not a meal."],
  ])("returns 422 for %j and saves nothing", async (text, meal, reason) => {
    nextMeal = meal as Meal;
    const res = await post({ text });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "not_food", reason });
    expect(rowCounts()).toEqual({ entries: 0, items: 0 });
    expect(warnLog).toHaveBeenCalledWith(expect.stringContaining("not food"), expect.objectContaining({ text, reason }));
  });

  it.each([
    new ModelError("refusal", "The model declined to answer", { stop_reason: "refusal", id: "msg_1" }),
    new ModelError("max_tokens", "The model's reply was cut off", { stop_reason: "max_tokens" }),
    new ModelError("schema", "The model's reply didn't match the expected format", { parse_error: "bad" }),
    new ModelError("api_error", "The model API call failed", { status: 401, request_id: "req_1" }),
  ])("returns 502 for a $kind failure, logs it and saves nothing", async (err) => {
    estimateMeal.mockRejectedValueOnce(err);
    const res = await post({ text: "2 eggs" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "model_error", reason: err.message });
    expect(rowCounts()).toEqual({ entries: 0, items: 0 });
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("model error"),
      expect.objectContaining({ kind: err.kind, text: "2 eggs", local_date: "2026-10-13", ...err.context }),
    );
  });

  it("returns 502 for an unexpected estimator error", async () => {
    estimateMeal.mockRejectedValueOnce(new Error("boom"));
    const res = await post({ text: "2 eggs" });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("model_error");
    expect(rowCounts()).toEqual({ entries: 0, items: 0 });
  });

  it("accepts text of exactly 2000 characters", async () => {
    expect((await post({ text: "a".repeat(2000) })).status).toBe(201);
  });

  it("returns 400 with a readable reason for text over 2000 characters, without calling the model", async () => {
    const res = await post({ text: "a".repeat(2001) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request", reason: "text: Too long: 2000 characters max" });
    expect(estimateMeal).not.toHaveBeenCalled();
    expect(rowCounts()).toEqual({ entries: 0, items: 0 });
  });

  it.each(["", "   ", "\n\t "])("returns 400 for blank text %j", async (text) => {
    const res = await post({ text });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request", reason: "text: Describe what you ate" });
    expect(estimateMeal).not.toHaveBeenCalled();
  });

  it("returns 400 with a 'field: message' reason, not raw Zod JSON, for a bad body", async () => {
    const res = await post({ text: "2 eggs", meal_type: "brunch" });
    expect(res.status).toBe(400);
    const { reason } = (await res.json()) as { reason: string };
    expect(reason).toMatch(/^meal_type: /);
    expect(reason).not.toContain("[");
  });

  it("returns 400 for a body that isn't JSON", async () => {
    const res = await app.request("/api/entries", { method: "POST", body: "not json" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
    expect(estimateMeal).not.toHaveBeenCalled();
  });
});

describe("GET /api/day/:date", () => {
  it("groups entries by meal, newest first, with subtotals and totals", async () => {
    await post({ text: "first breakfast" });
    clock = new Date("2026-10-13T12:30:00Z");
    await post({ text: "second breakfast" });
    nextMeal = { meal_type: "lunch", items: [item("Burrito", 650, 30, 70, 25.5)], not_food_reason: null };
    await post({ text: "burrito" });

    const { status, body } = await getDay("today");
    expect(status).toBe(200);
    expect(body.date).toBe("2026-10-13");
    expect(body.meals.map((m) => m.meal_type)).toEqual(["breakfast", "lunch", "dinner", "snack"]);

    const [b, l, d, s] = body.meals;
    expect(b!.entries.map((e) => e.raw_text)).toEqual(["second breakfast", "first breakfast"]);
    expect(b!.calories).toBe(804);
    expect(l!.calories).toBe(650);
    expect(d!.entries).toEqual([]);
    expect(s!.calories).toBe(0);
    expect(body.totals).toEqual({ eaten_kcal: 1454, burned_kcal: 0, protein_g: 67.4, carbs_g: 144.8, fat_g: 63.9 });

    expect((await getDay("2026-10-13")).body).toEqual(body);
  });

  it("has the final response shape: date, meals, burns, weight, goals and totals", async () => {
    const { body } = await getDay("today");
    expect(Object.keys(body).sort()).toEqual(["burns", "date", "goals", "meals", "totals", "weight"]);
    expect(DayResponseSchema.safeParse(body).success).toBe(true);
    // A day with nothing logged has no burns and no weight.
    expect(body.burns).toEqual([]);
    expect(body.weight).toBeNull();
    expect(body.goals).toEqual({ calorie_goal: 2000, protein_goal_g: 150, carbs_goal_g: 200, fat_goal_g: 65 });
  });

  it("reflects changed goals in the day response", async () => {
    const goals = { calorie_goal: 1800, protein_goal_g: 160, carbs_goal_g: 150, fat_goal_g: 55 };
    const put = await app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goals),
    });
    expect(put.status).toBe(200);
    expect((await getDay("today")).body.goals).toEqual(goals);
    expect((await getDay("2026-10-01")).body.goals).toEqual(goals);
    handle.db.update(settings).set({ calorieGoal: 2000, proteinGoalG: 150, carbsGoalG: 200, fatGoalG: 65 }).run();
  });

  it("returns a past day's own entries and totals, not today's", async () => {
    clock = new Date("2026-10-10T16:00:00Z");
    await post({ text: "last saturday" });
    clock = new Date("2026-10-13T12:14:00Z");
    await post({ text: "today one" });
    await post({ text: "today two" });

    const past = (await getDay("2026-10-10")).body;
    const now = (await getDay("today")).body;
    const texts = (day: DayResponse) => day.meals.flatMap((m) => m.entries.map((e) => e.raw_text));
    expect(past.date).toBe("2026-10-10");
    expect(texts(past)).toEqual(["last saturday"]);
    expect(texts(now).sort()).toEqual(["today one", "today two"]);
    expect(past.totals.eaten_kcal).toBe(past.meals.reduce((sum, m) => sum + m.calories, 0));
    expect(now.totals.eaten_kcal).toBe(now.meals.reduce((sum, m) => sum + m.calories, 0));
    expect(now.totals.eaten_kcal).toBe(2 * past.totals.eaten_kcal);
  });

  it("returns an empty day with zero totals", async () => {
    const { status, body } = await getDay("2026-10-01");
    expect(status).toBe(200);
    expect(body.meals.every((m) => m.entries.length === 0)).toBe(true);
    expect(body.totals).toEqual({ eaten_kcal: 0, burned_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });

  it.each(["2026-10-14", "2026-13-01", "2026-02-30", "yesterday", "20261013"])("rejects %s with 400", async (date) => {
    expect((await getDay(date)).status).toBe(400);
  });
});
