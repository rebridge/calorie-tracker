import { describe, expect, it } from "vitest";
import { movingAverage } from "./moving-average.js";

const r = (date: string, weight_lb: number) => ({ date, weight_lb });

describe("movingAverage", () => {
  it("is empty with no readings", () => {
    expect(movingAverage([], "2026-10-01")).toEqual([]);
  });

  it("averages a single reading to itself", () => {
    expect(movingAverage([r("2026-10-13", 182.4)], "2026-10-01")).toEqual([{ date: "2026-10-13", avg_lb: 182.4 }]);
  });

  it("averages the readings so far, then slides over the last 7 days", () => {
    const readings = [180, 181, 182, 183, 184, 185, 186, 187].map((w, i) => r(`2026-10-0${i + 1}`, w));
    expect(movingAverage(readings, "2026-10-01").map((p) => p.avg_lb)).toEqual([
      180, 180.5, 181, 181.5, 182, 182.5, 183,
      // Oct 8 drops Oct 1: (181 + … + 187) / 7.
      184,
    ]);
  });

  it("windows by calendar day, so a gap doesn't pull in older readings", () => {
    const readings = [r("2026-10-01", 190), r("2026-10-07", 180), r("2026-10-08", 182)];
    // Oct 7's window is Oct 1–7 (both readings); Oct 8's is Oct 2–8, which no longer holds Oct 1.
    expect(movingAverage(readings, "2026-10-01")).toEqual([
      { date: "2026-10-01", avg_lb: 190 },
      { date: "2026-10-07", avg_lb: 185 },
      { date: "2026-10-08", avg_lb: 181 },
    ]);
  });

  it("stands a reading after a gap of a week or more on its own", () => {
    const readings = [r("2026-10-01", 190), r("2026-10-08", 180)];
    expect(movingAverage(readings, "2026-10-01")[1]).toEqual({ date: "2026-10-08", avg_lb: 180 });
  });

  it("emits only on days that have a reading", () => {
    const readings = [r("2026-10-01", 180), r("2026-10-04", 182)];
    expect(movingAverage(readings, "2026-10-01").map((p) => p.date)).toEqual(["2026-10-01", "2026-10-04"]);
  });

  it("uses lead-in readings before `from` but doesn't emit them", () => {
    // Oct 10's window is Oct 4–10: Oct 4 counts, Oct 3 doesn't.
    const readings = [r("2026-10-03", 200), r("2026-10-04", 184), r("2026-10-09", 182), r("2026-10-10", 180)];
    expect(movingAverage(readings, "2026-10-10")).toEqual([{ date: "2026-10-10", avg_lb: 182 }]);
  });

  it("rounds to 2 decimals", () => {
    const readings = [r("2026-10-01", 180), r("2026-10-02", 180), r("2026-10-03", 181)];
    expect(movingAverage(readings, "2026-10-01")[2]).toEqual({ date: "2026-10-03", avg_lb: 180.33 });
  });

  it("works across month and year boundaries", () => {
    const readings = [r("2025-12-30", 180), r("2026-01-02", 182)];
    expect(movingAverage(readings, "2025-12-30")[1]).toEqual({ date: "2026-01-02", avg_lb: 181 });
  });
});
