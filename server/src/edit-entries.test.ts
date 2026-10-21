import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DayResponse, Entry, Meal } from "@calorie-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { MealEstimator } from "./claude.js";
import { openDb } from "./db/index.js";
import { entries, entryItems } from "./db/schema.js";

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
  meal_type: "snack",
  items: [item("Scrambled eggs", 182, 12.6, 1.2, 13.8), item("Flour tortilla", 218, 5.8, 36.2, 5.4), item("Black coffee", 2, 0.3, 0, 0)],
  not_food_reason: null,
};

let tmp: string;
let handle: ReturnType<typeof openDb>;
let nextMeal: Meal;
const estimateMeal = vi.fn<MealEstimator>(async () => ({
  meal: nextMeal,
  model: "claude-haiku-5-5",
  response: { id: "msg_test" },
  inputTokens: 400,
  outputTokens: 250,
}));
let app: ReturnType<typeof createApp>;
const prevTz = process.env.TZ;
// 08:14 in New York on Tue Oct 13.
const clock = new Date("2026-10-13T12:14:00Z");

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
  nextMeal = breakfast;
});

const send = (method: string, url: string, body?: unknown) =>
  app.request(url, {
    method,
    ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });

const logMeal = async (text = "eggs and coffee") => (await (await send("POST", "/api/entries", { text })).json()) as Entry;
const getDay = async () => (await (await send("GET", "/api/day/today")).json()) as DayResponse;
const rows = () => ({
  entries: handle.db.select().from(entries).all(),
  items: handle.db.select().from(entryItems).all(),
});

describe("PATCH /api/items/:id", () => {
  it("updates the fields, marks the item edited and flows into the entry and day totals", async () => {
    const entry = await logMeal();
    const target = entry.items[1]!;

    const res = await send("PATCH", `/api/items/${target.id}`, { calories: 300, protein_g: 7.25, name: "  Big tortilla " });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { local_date: string; item: Entry["items"][number] };
    expect(body.local_date).toBe("2026-10-13");
    expect(body.item).toMatchObject({
      id: target.id,
      entry_id: entry.id,
      name: "Big tortilla",
      portion: "1 serving",
      calories: 300,
      protein_g: 7.3,
      carbs_g: 36.2,
      edited: true,
    });

    const day = await getDay();
    const updated = day.meals.find((m) => m.meal_type === "snack")!.entries[0]!;
    expect(updated.calories).toBe(182 + 300 + 2);
    expect(updated.items.map((i) => i.edited)).toEqual([false, true, false]);
    expect(day.totals.eaten_kcal).toBe(484);
    expect(rows().items.find((r) => r.id === target.id)?.edited).toBe(true);
  });

  it("rounds calories to an integer and accepts zero", async () => {
    const entry = await logMeal();
    const res = await send("PATCH", `/api/items/${entry.items[0]!.id}`, { calories: 99.6, fat_g: 0 });
    const { item: updated } = (await res.json()) as { item: Entry["items"][number] };
    expect(updated).toMatchObject({ calories: 100, fat_g: 0 });
  });

  it("leaves the other items and the audit fields alone", async () => {
    const entry = await logMeal();
    await send("PATCH", `/api/items/${entry.items[0]!.id}`, { calories: 1 });
    const { items } = rows();
    expect(items.filter((i) => i.edited)).toHaveLength(1);
    expect(rows().entries[0]).toMatchObject({ rawText: "eggs and coffee", model: "claude-haiku-5-5" });
  });

  it("returns 404 for a missing item", async () => {
    const res = await send("PATCH", "/api/items/9999", { calories: 10 });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", reason: "Item not found" });
  });

  it.each(["abc", "0", "-1", "1.5"])("returns 404 for the id %s", async (id) => {
    expect((await send("PATCH", `/api/items/${id}`, { calories: 10 })).status).toBe(404);
  });

  it.each([
    {},
    { calories: -1 },
    { protein_g: -0.1 },
    { carbs_g: "12" },
    { fat_g: null },
    { name: "" },
    { name: "   " },
    { portion: "" },
    { calories: "lots" },
  ])("rejects %j with 400 and changes nothing", async (body) => {
    const entry = await logMeal();
    const res = await send("PATCH", `/api/items/${entry.items[0]!.id}`, body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_request");
    expect(rows().items.some((i) => i.edited)).toBe(false);
  });

  it("rejects a body that isn't JSON with 400", async () => {
    const entry = await logMeal();
    const res = await app.request(`/api/items/${entry.items[0]!.id}`, { method: "PATCH", body: "nope" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/items/:id", () => {
  it("removes one item and keeps the entry while it still has items", async () => {
    const entry = await logMeal();
    const res = await send("DELETE", `/api/items/${entry.items[2]!.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ local_date: "2026-10-13", entry_deleted: false });

    const day = await getDay();
    const remaining = day.meals.find((m) => m.meal_type === "snack")!.entries[0]!;
    expect(remaining.items.map((i) => i.name)).toEqual(["Scrambled eggs", "Flour tortilla"]);
    expect(remaining.calories).toBe(400);
  });

  it("deletes the entry when its last item goes", async () => {
    const entry = await logMeal();
    const [a, b, c] = entry.items;
    expect(((await (await send("DELETE", `/api/items/${a!.id}`)).json()) as { entry_deleted: boolean }).entry_deleted).toBe(false);
    await send("DELETE", `/api/items/${b!.id}`);
    const res = await send("DELETE", `/api/items/${c!.id}`);
    expect(await res.json()).toEqual({ local_date: "2026-10-13", entry_deleted: true });

    expect(rows()).toEqual({ entries: [], items: [] });
    const day = await getDay();
    expect(day.meals.every((m) => m.entries.length === 0)).toBe(true);
    expect(day.totals.eaten_kcal).toBe(0);
  });

  it("only deletes the entry that ran out of items", async () => {
    nextMeal = { ...breakfast, items: [item("Toast", 100, 3, 18, 1)] };
    const lonely = await logMeal("toast");
    nextMeal = breakfast;
    const other = await logMeal("eggs");

    await send("DELETE", `/api/items/${lonely.items[0]!.id}`);
    expect(rows().entries.map((e) => e.id)).toEqual([other.id]);
    expect(rows().items).toHaveLength(3);
  });

  it("returns 404 for a missing item", async () => {
    const res = await send("DELETE", "/api/items/9999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", reason: "Item not found" });
    expect((await send("DELETE", "/api/items/abc")).status).toBe(404);
  });
});

describe("PATCH /api/entries/:id", () => {
  it("moves the entry to another meal group", async () => {
    const entry = await logMeal();
    expect(entry.meal_type).toBe("snack");

    const res = await send("PATCH", `/api/entries/${entry.id}`, { meal_type: "lunch" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { local_date: string; entry: Entry };
    expect(body.local_date).toBe("2026-10-13");
    expect(body.entry).toMatchObject({ id: entry.id, meal_type: "lunch", calories: 402 });
    expect(body.entry.items).toHaveLength(3);

    const day = await getDay();
    expect(day.meals.find((m) => m.meal_type === "snack")!.entries).toEqual([]);
    expect(day.meals.find((m) => m.meal_type === "lunch")).toMatchObject({ calories: 402 });
    expect(day.meals.find((m) => m.meal_type === "lunch")!.entries.map((e) => e.id)).toEqual([entry.id]);
  });

  it("does not mark items edited", async () => {
    const entry = await logMeal();
    await send("PATCH", `/api/entries/${entry.id}`, { meal_type: "dinner" });
    expect(rows().items.some((i) => i.edited)).toBe(false);
  });

  it("returns 404 for a missing entry", async () => {
    const res = await send("PATCH", "/api/entries/9999", { meal_type: "lunch" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", reason: "Entry not found" });
    expect((await send("PATCH", "/api/entries/abc", { meal_type: "lunch" })).status).toBe(404);
  });

  it.each([{}, { meal_type: "brunch" }, { meal_type: null }, { meal_type: 1 }])("rejects %j with 400", async (body) => {
    const entry = await logMeal();
    const res = await send("PATCH", `/api/entries/${entry.id}`, body);
    expect(res.status).toBe(400);
    expect(rows().entries[0]!.mealType).toBe("snack");
  });
});

describe("DELETE /api/entries/:id", () => {
  it("deletes the entry and cascades to its items", async () => {
    const entry = await logMeal();
    const keep = await logMeal("other");
    expect(rows().items).toHaveLength(6);

    const res = await send("DELETE", `/api/entries/${entry.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ local_date: "2026-10-13" });

    const left = rows();
    expect(left.entries.map((e) => e.id)).toEqual([keep.id]);
    // No orphans: every remaining item belongs to a remaining entry.
    expect(left.items).toHaveLength(3);
    expect(left.items.every((i) => i.entryId === keep.id)).toBe(true);
    expect((await getDay()).totals.eaten_kcal).toBe(402);
  });

  it("returns 404 for a missing entry and for a second delete", async () => {
    const entry = await logMeal();
    expect((await send("DELETE", `/api/entries/${entry.id}`)).status).toBe(200);
    const again = await send("DELETE", `/api/entries/${entry.id}`);
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: "not_found", reason: "Entry not found" });
    expect((await send("DELETE", "/api/entries/abc")).status).toBe(404);
  });
});
