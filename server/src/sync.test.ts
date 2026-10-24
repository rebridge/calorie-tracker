import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BurnSchema, EntrySchema, type DayResponse, type Entry, type Meal, type SyncEntryRequest } from "@calorie-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { MealEstimator } from "./claude.js";
import { openDb } from "./db/index.js";
import { burns, entries, entryItems } from "./db/schema.js";

const lunch: Meal = {
  meal_type: null,
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
  estimateMeal.mockClear();
  // 08:14 in New York on Tue Oct 13.
  clock = new Date("2026-10-13T12:14:00Z");
});

const send = (method: string, url: string, body?: unknown) =>
  app.request(url, {
    method,
    ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
const getDay = async (date: string) => (await (await send("GET", `/api/day/${date}`)).json()) as DayResponse;
const dayEntries = (day: DayResponse) => day.meals.flatMap((m) => m.entries);

const ID = "8F14E45F-CEEA-467A-9C3B-2D7B4C1E0A11";
const modelResponse = JSON.stringify({ id: "msg_phone", content: [{ type: "text", text: "{}" }] });
const phoneEntry: SyncEntryRequest = {
  date: "2026-10-13",
  // 07:30 in New York, 44 minutes before the upload.
  logged_at: "2026-10-13T11:30:00.000Z",
  meal_type: "breakfast",
  text: "2 eggs and toast",
  model: "claude-haiku-5-5",
  model_response: modelResponse,
  input_tokens: 380,
  output_tokens: 210,
  items: [
    { name: "Eggs", portion: "2 large", calories: 143.6, protein_g: 12.56, carbs_g: 0.7, fat_g: 9.5, confidence: "high", assumption: null, edited: false },
    { name: "Toast", portion: "1 slice", calories: 80, protein_g: 3, carbs_g: 14, fat_g: 1, confidence: "medium", assumption: "Assumed white bread", edited: true },
  ],
};

describe("PUT /api/sync/entries/:client_id", () => {
  it("saves the phone's estimate with created_at from logged_at and returns it", async () => {
    const res = await send("PUT", `/api/sync/entries/${ID}`, phoneEntry);
    expect(res.status).toBe(201);
    const entry = EntrySchema.parse(await res.json());
    expect(entry).toMatchObject({
      local_date: "2026-10-13",
      meal_type: "breakfast",
      raw_text: "2 eggs and toast",
      created_at: "2026-10-13T11:30:00.000Z",
      calories: 144 + 80,
      protein_g: 15.6,
    });
    expect(entry.items.map((i) => [i.name, i.edited])).toEqual([
      ["Eggs", false],
      ["Toast", true],
    ]);
    expect(dayEntries(await getDay("2026-10-13")).map((e) => e.id)).toEqual([entry.id]);
    expect(estimateMeal).not.toHaveBeenCalled();
  });

  it("stores the model reply verbatim, the tokens, and the client id lowercased", async () => {
    await send("PUT", `/api/sync/entries/${ID}`, phoneEntry);
    const [row] = handle.db.select().from(entries).all();
    expect(row).toMatchObject({
      modelResponse,
      model: "claude-haiku-5-5",
      inputTokens: 380,
      outputTokens: 210,
      clientId: ID.toLowerCase(),
    });
  });

  it("replaces the meal type and items on a retry instead of adding a second entry", async () => {
    const first = (await (await send("PUT", `/api/sync/entries/${ID}`, phoneEntry)).json()) as Entry;
    const res = await send("PUT", `/api/sync/entries/${ID.toLowerCase()}`, {
      ...phoneEntry,
      meal_type: "snack",
      items: [{ ...phoneEntry.items[0]!, calories: 200, edited: true }],
    });
    expect(res.status).toBe(200);
    const entry = (await res.json()) as Entry;
    expect(entry).toMatchObject({ id: first.id, meal_type: "snack", calories: 200, created_at: first.created_at });
    expect(entry.items).toHaveLength(1);
    expect(handle.db.select().from(entries).all()).toHaveLength(1);
    expect(handle.db.select().from(entryItems).all()).toHaveLength(1);
  });

  it("clamps a logged_at ahead of the server's clock to now", async () => {
    const entry = (await (await send("PUT", `/api/sync/entries/${ID}`, { ...phoneEntry, logged_at: "2026-10-13T18:00:00Z" })).json()) as Entry;
    expect(entry.created_at).toBe("2026-10-13T12:14:00.000Z");
  });

  it("saves to a past day", async () => {
    const res = await send("PUT", `/api/sync/entries/${ID}`, { ...phoneEntry, date: "2026-10-12" });
    expect(res.status).toBe(201);
    expect(dayEntries(await getDay("2026-10-12"))).toHaveLength(1);
  });

  it("counts the phone's tokens in the settings total", async () => {
    await send("PUT", `/api/sync/entries/${ID}`, phoneEntry);
    const settings = (await (await send("GET", "/api/settings")).json()) as { token_usage: unknown };
    expect(settings.token_usage).toEqual({ input_tokens: 380, output_tokens: 210 });
  });

  it.each([
    ["a future date", { date: "2026-10-14" }],
    ["no items", { items: [] }],
    ["a negative calorie count", { items: [{ ...phoneEntry.items[0]!, calories: -1 }] }],
    ["a model reply that isn't JSON", { model_response: "not json" }],
    ["blank text", { text: "  " }],
    ["a logged_at that isn't a timestamp", { logged_at: "yesterday" }],
  ])("rejects %s with 400 and saves nothing", async (_, patch) => {
    expect((await send("PUT", `/api/sync/entries/${ID}`, { ...phoneEntry, ...patch })).status).toBe(400);
    expect(handle.db.select().from(entries).all()).toHaveLength(0);
  });

  it("rejects a client id that isn't a UUID", async () => {
    expect((await send("PUT", "/api/sync/entries/42", phoneEntry)).status).toBe(400);
  });
});

describe("PUT /api/sync/burns/:client_id", () => {
  const phoneBurn = { date: "2026-10-13", logged_at: "2026-10-13T11:00:00Z", calories: 300, note: "run" };

  it("saves the burn, then updates it on a retry", async () => {
    const res = await send("PUT", `/api/sync/burns/${ID}`, phoneBurn);
    expect(res.status).toBe(201);
    const burn = BurnSchema.parse(await res.json());
    expect(burn).toEqual({
      id: expect.any(Number),
      local_date: "2026-10-13",
      calories: 300,
      note: "run",
      created_at: "2026-10-13T11:00:00.000Z",
    });

    const retry = await send("PUT", `/api/sync/burns/${ID}`, { ...phoneBurn, calories: 350, note: "  " });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ...burn, calories: 350, note: null });
    expect(handle.db.select().from(burns).all()).toHaveLength(1);
    expect((await getDay("2026-10-13")).totals.burned_kcal).toBe(350);
  });

  it.each([
    ["a future date", { date: "2026-10-14" }],
    ["zero calories", { calories: 0 }],
    ["fractional calories", { calories: 12.5 }],
  ])("rejects %s with 400", async (_, patch) => {
    expect((await send("PUT", `/api/sync/burns/${ID}`, { ...phoneBurn, ...patch })).status).toBe(400);
    expect(handle.db.select().from(burns).all()).toHaveLength(0);
  });
});

describe("POST /api/entries from the phone's offline queue", () => {
  it("estimates once per client id: a retry returns the saved entry", async () => {
    const body = { text: "burrito", date: "2026-10-13", client_id: ID, logged_at: "2026-10-13T11:00:00Z" };
    const first = await send("POST", "/api/entries", body);
    expect(first.status).toBe(201);
    const retry = await send("POST", "/api/entries", body);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(await first.json());
    expect(estimateMeal).toHaveBeenCalledTimes(1);
    expect(handle.db.select().from(entries).all()).toHaveLength(1);
  });

  it("uses logged_at for created_at, the model's local time and the meal-time fallback", async () => {
    // 07:00 in New York, uploaded at 08:14.
    const res = await send("POST", "/api/entries", { text: "burrito", client_id: ID, logged_at: "2026-10-13T11:00:00Z" });
    const entry = (await res.json()) as Entry;
    expect(entry).toMatchObject({ created_at: "2026-10-13T11:00:00.000Z", local_date: "2026-10-13", meal_type: "breakfast" });
    expect(estimateMeal).toHaveBeenCalledWith({ text: "burrito", localTime: "07:00" });
  });

  it("clamps a logged_at ahead of the server's clock to now", async () => {
    const res = await send("POST", "/api/entries", { text: "burrito", client_id: ID, logged_at: "2026-10-13T16:30:00Z" });
    expect(((await res.json()) as Entry).created_at).toBe("2026-10-13T12:14:00.000Z");
    expect(estimateMeal).toHaveBeenCalledWith({ text: "burrito", localTime: "08:14" });
  });

  it("defaults the date to the day it was logged, with that day's local time", async () => {
    // 22:00 on Mon Oct 12 in New York, uploaded the next morning.
    const res = await send("POST", "/api/entries", { text: "burrito", client_id: ID, logged_at: "2026-10-13T02:00:00Z" });
    const entry = (await res.json()) as Entry;
    expect(entry).toMatchObject({ local_date: "2026-10-12", created_at: "2026-10-13T02:00:00.000Z", meal_type: "snack" });
    expect(estimateMeal).toHaveBeenCalledWith({ text: "burrito", localTime: "22:00" });
  });

  it("still rejects a future date", async () => {
    const res = await send("POST", "/api/entries", { text: "burrito", date: "2026-10-14", client_id: ID });
    expect(res.status).toBe(400);
    expect(estimateMeal).not.toHaveBeenCalled();
  });
});
