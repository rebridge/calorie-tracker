import {
  addDays,
  formatDayLabel,
  formatShortDate,
  fromCalendarDate,
  swipeStep,
  toCalendarDate,
} from "@calorie-tracker/shared";
import { describe, expect, it } from "vitest";

describe("addDays", () => {
  it("steps across month, year and leap-day boundaries", () => {
    expect(addDays("2026-10-13", -1)).toBe("2026-10-12");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-13", -21)).toBe("2026-09-22");
    expect(addDays("2026-10-13", 0)).toBe("2026-10-13");
  });

  it("is not thrown off by daylight-saving changes", () => {
    const prevTz = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
      expect(addDays("2026-11-02", -1)).toBe("2026-11-01");
      expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });

  it("rejects text that isn't YYYY-MM-DD", () => {
    expect(() => addDays("today", 1)).toThrow(RangeError);
  });
});

describe("formatDayLabel", () => {
  const today = "2026-10-13";

  it("says Today and Yesterday", () => {
    expect(formatDayLabel("2026-10-13", today)).toBe("Today");
    expect(formatDayLabel("2026-10-12", today)).toBe("Yesterday");
  });

  it("uses 'Mon, Oct 13' for anything earlier", () => {
    expect(formatDayLabel("2026-10-05", today)).toBe("Mon, Oct 5");
    expect(formatDayLabel("2026-09-22", today)).toBe("Tue, Sep 22");
    expect(formatDayLabel("2026-01-01", today)).toBe("Thu, Jan 1");
  });

  it("adds the year only when it differs from today's", () => {
    expect(formatDayLabel("2025-10-13", today)).toBe("Mon, Oct 13, 2025");
    expect(formatDayLabel("2025-12-31", "2026-01-01")).toBe("Yesterday");
    expect(formatDayLabel("2025-12-30", "2026-01-01")).toBe("Tue, Dec 30, 2025");
  });

  it("labels a future date by its date (the Day view shows an error for these)", () => {
    expect(formatDayLabel("2026-10-14", today)).toBe("Wed, Oct 14");
  });
});

describe("formatShortDate", () => {
  it("never says Today or Yesterday", () => {
    expect(formatShortDate("2026-10-13", "2026-10-13")).toBe("Tue, Oct 13");
    expect(formatShortDate("2026-10-12", "2026-10-13")).toBe("Mon, Oct 12");
  });
});

describe("calendar dates", () => {
  it("round-trips YYYY-MM-DD through a local-midnight Date", () => {
    for (const date of ["2026-10-13", "2024-02-29", "2026-03-08", "2026-11-01", "0999-01-02"]) {
      expect(fromCalendarDate(toCalendarDate(date))).toBe(date);
    }
    const d = toCalendarDate("2026-10-13");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 13, 0]);
  });
});

describe("swipeStep", () => {
  it("steps back on a rightward swipe and forward on a leftward one", () => {
    expect(swipeStep(120, 5)).toBe(-1);
    expect(swipeStep(-120, -5)).toBe(1);
  });

  it("ignores short drags", () => {
    expect(swipeStep(40, 0)).toBe(0);
    expect(swipeStep(-59, 3)).toBe(0);
  });

  it("ignores mostly-vertical drags, i.e. scrolling", () => {
    expect(swipeStep(80, 200)).toBe(0);
    expect(swipeStep(-100, 70)).toBe(0);
  });

  it("allows a slightly diagonal swipe", () => {
    expect(swipeStep(100, 40)).toBe(-1);
  });
});
