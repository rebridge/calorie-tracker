import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { openDb } from "./db/index.js";
import { settings } from "./db/schema.js";

let tmp: string;
let handle: ReturnType<typeof openDb>;
let app: ReturnType<typeof createApp>;

const defaults = { calorie_goal: 2000, protein_goal_g: 150, carbs_goal_g: 200, fat_goal_g: 65 };

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "calorie-tracker-settings-"));
  handle = openDb(path.join(tmp, "data", "calories.db"));
  app = createApp({ db: handle.db, estimateMeal: () => Promise.reject(new Error("not used")) });
});

afterAll(() => {
  handle.sqlite.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  handle.db
    .update(settings)
    .set({ calorieGoal: 2000, proteinGoalG: 150, carbsGoalG: 200, fatGoalG: 65 })
    .run();
});

const get = () => app.request("/api/settings");
const put = (body: unknown) =>
  app.request("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("GET /api/settings", () => {
  it("returns the default goals plus the read-only model and database path", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ...defaults,
      model: "claude-haiku-5-5",
      database_path: path.join(tmp, "data", "calories.db"),
    });
  });
});

describe("PUT /api/settings", () => {
  it("updates the goals, returns them with the read-only fields, and persists", async () => {
    const goals = { calorie_goal: 1800, protein_goal_g: 160, carbs_goal_g: 150, fat_goal_g: 55 };
    const res = await put(goals);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ...goals, model: "claude-haiku-5-5" });

    expect(await (await get()).json()).toMatchObject(goals);
    expect(handle.db.select().from(settings).all()).toEqual([
      { id: 1, calorieGoal: 1800, proteinGoalG: 160, carbsGoalG: 150, fatGoalG: 55 },
    ]);
  });

  it("persists across a reopen of the database", async () => {
    await put({ ...defaults, calorie_goal: 2400 });
    const again = openDb(handle.sqlite.name);
    expect(again.db.select().from(settings).get()?.calorieGoal).toBe(2400);
    again.sqlite.close();
  });

  it.each([
    ["zero", { ...defaults, protein_goal_g: 0 }, "protein_goal_g"],
    ["negative", { ...defaults, calorie_goal: -5 }, "calorie_goal"],
    ["non-integer", { ...defaults, carbs_goal_g: 150.5 }, "carbs_goal_g"],
    ["a string", { ...defaults, fat_goal_g: "65" }, "fat_goal_g"],
    ["null", { ...defaults, fat_goal_g: null }, "fat_goal_g"],
    ["missing", { calorie_goal: 2000, protein_goal_g: 150, carbs_goal_g: 200 }, "fat_goal_g"],
  ])("rejects %s with 400 and a readable reason, saving nothing", async (_name, body, field) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; reason: string };
    expect(json.error).toBe("invalid_request");
    expect(json.reason).toContain(field);
    expect(json.reason).toContain("whole number greater than 0");
    expect(await (await get()).json()).toMatchObject(defaults);
  });

  it.each(["not json", "null", "[]"])("rejects a non-object body (%s)", async (raw) => {
    expect((await put(raw)).status).toBe(400);
  });

  it("ignores read-only fields sent by the client", async () => {
    const res = await put({ ...defaults, model: "other", database_path: "/etc/passwd" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ model: "claude-haiku-5-5" });
  });
});
