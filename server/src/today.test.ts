import { describe, expect, it } from "vitest";
import { localTime, today } from "./today.js";

describe("today", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(today(new Date("2026-03-07T12:00:00Z"), "UTC")).toBe("2026-03-07");
  });

  it("uses the given time zone for the day boundary", () => {
    // 02:30 UTC on Oct 14 is still the evening of Oct 13 in New York.
    const instant = new Date("2026-10-14T02:30:00Z");
    expect(today(instant, "America/New_York")).toBe("2026-10-13");
    expect(today(instant, "UTC")).toBe("2026-10-14");
    expect(today(instant, "Asia/Tokyo")).toBe("2026-10-14");
  });

  it("handles the instant right around local midnight", () => {
    // New York is UTC-4 in October.
    expect(today(new Date("2026-10-14T03:59:59Z"), "America/New_York")).toBe("2026-10-13");
    expect(today(new Date("2026-10-14T04:00:00Z"), "America/New_York")).toBe("2026-10-14");
  });

  it("defaults to the TZ env var", () => {
    const prev = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      // 12:00 UTC on Oct 13 is already Oct 14 in Auckland (UTC+13 in October).
      expect(today(new Date("2026-10-13T12:00:00Z"))).toBe("2026-10-14");
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });
});

describe("localTime", () => {
  it("formats as 24h HH:MM in the given time zone", () => {
    expect(localTime(new Date("2026-10-14T12:14:00Z"), "America/New_York")).toBe("08:14");
    expect(localTime(new Date("2026-10-14T22:05:00Z"), "America/New_York")).toBe("18:05");
  });

  it("writes midnight as 00, not 24", () => {
    expect(localTime(new Date("2026-10-14T04:00:00Z"), "America/New_York")).toBe("00:00");
  });
});
