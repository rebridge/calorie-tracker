import { progressPercent, remainingKcal } from "@calorie-tracker/shared";
import { describe, expect, it } from "vitest";

describe("remainingKcal", () => {
  it("is goal − eaten + burned", () => {
    expect(remainingKcal({ goal: 2000, eaten: 1454, burned: 0 })).toBe(546);
    expect(remainingKcal({ goal: 2000, eaten: 1454, burned: 300 })).toBe(846);
  });

  it("is the whole goal on an empty day", () => {
    expect(remainingKcal({ goal: 2000, eaten: 0, burned: 0 })).toBe(2000);
  });

  it("is zero exactly at the goal", () => {
    expect(remainingKcal({ goal: 2000, eaten: 2000, burned: 0 })).toBe(0);
  });

  it("goes negative when over budget", () => {
    expect(remainingKcal({ goal: 2000, eaten: 2312, burned: 0 })).toBe(-312);
  });

  it("lets burned calories pull an over-budget day back under", () => {
    expect(remainingKcal({ goal: 2000, eaten: 2312, burned: 312 })).toBe(0);
    expect(remainingKcal({ goal: 2000, eaten: 2312, burned: 500 })).toBe(188);
  });
});

describe("progressPercent", () => {
  it("is the share of the goal reached", () => {
    expect(progressPercent(75, 150)).toBe(50);
    expect(progressPercent(0, 150)).toBe(0);
  });

  it("caps at 100 when over the goal", () => {
    expect(progressPercent(150, 150)).toBe(100);
    expect(progressPercent(240, 150)).toBe(100);
  });

  it("never goes below 0 or divides by a zero goal", () => {
    expect(progressPercent(-5, 150)).toBe(0);
    expect(progressPercent(50, 0)).toBe(0);
  });
});
