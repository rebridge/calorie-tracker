import { describe, expect, it } from "vitest";
import { parseDateParam } from "./date-param.js";

// 08:14 in New York on Tue Oct 13 (04:00 UTC the next day would already be Oct 14 there).
const now = new Date("2026-10-13T12:14:00Z");

describe("parseDateParam", () => {
  const prevTz = process.env.TZ;
  const withTz = (tz: string, fn: () => void) => {
    process.env.TZ = tz;
    try {
      fn();
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  };

  it("resolves `today` in the server's time zone", () => {
    // 02:30 UTC on Oct 14 is still the evening of Oct 13 in New York.
    const instant = new Date("2026-10-14T02:30:00Z");
    withTz("America/New_York", () => expect(parseDateParam("today", instant)).toBe("2026-10-13"));
    withTz("UTC", () => expect(parseDateParam("today", instant)).toBe("2026-10-14"));
  });

  it("accepts today's date and past dates as given", () => {
    withTz("America/New_York", () => {
      expect(parseDateParam("2026-10-13", now)).toBe("2026-10-13");
      expect(parseDateParam("2026-10-01", now)).toBe("2026-10-01");
      expect(parseDateParam("2024-02-29", now)).toBe("2024-02-29");
    });
  });

  it("rejects future dates, judged by the server's today", () => {
    withTz("America/New_York", () => {
      expect(parseDateParam("2026-10-14", now)).toBeNull();
      expect(parseDateParam("2099-01-01", now)).toBeNull();
    });
  });

  it.each(["2026-13-01", "2026-02-30", "2026-2-3", "20261013", "yesterday", "Today", "TODAY", "", " 2026-10-13", "2026-10-13T00:00:00Z"])(
    "rejects malformed %j",
    (param) => {
      withTz("America/New_York", () => expect(parseDateParam(param, now)).toBeNull());
    },
  );
});
