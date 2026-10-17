import { describe, expect, it } from "vitest";
import { mealTypeForTime, resolveMealType } from "./meal-type.js";

describe("mealTypeForTime", () => {
  it.each([
    ["00:00", "breakfast"],
    ["08:14", "breakfast"],
    ["10:29", "breakfast"],
    ["10:30", "lunch"],
    ["14:29", "lunch"],
    ["14:30", "snack"],
    ["16:59", "snack"],
    ["17:00", "dinner"],
    ["20:59", "dinner"],
    ["21:00", "snack"],
    ["23:59", "snack"],
  ])("%s → %s", (time, meal) => {
    expect(mealTypeForTime(time)).toBe(meal);
  });
});

describe("resolveMealType", () => {
  it("prefers the request's meal_type", () => {
    expect(resolveMealType({ requested: "dinner", fromModel: "breakfast", localTime: "12:00" })).toBe("dinner");
  });

  it("then Claude's meal_type", () => {
    expect(resolveMealType({ requested: undefined, fromModel: "breakfast", localTime: "12:00" })).toBe("breakfast");
  });

  it("then falls back to the time of day", () => {
    expect(resolveMealType({ requested: undefined, fromModel: null, localTime: "12:00" })).toBe("lunch");
  });
});
