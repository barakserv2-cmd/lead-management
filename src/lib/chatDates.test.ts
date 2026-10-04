import { describe, it, expect } from "vitest";
import { chatDayLabel, chatFullDateTime, chatTime, israelDayKey } from "./chatDates";

// Sunday 04.10.2026, 10:00 in Israel (UTC+3)
const NOW = new Date("2026-10-04T07:00:00Z");

describe("chatDayLabel", () => {
  it("today and yesterday by name", () => {
    expect(chatDayLabel("2026-10-04T05:00:00Z", NOW)).toBe("היום");
    expect(chatDayLabel("2026-10-03T12:00:00Z", NOW)).toBe("אתמול");
  });

  it("the last week by weekday", () => {
    expect(chatDayLabel("2026-10-02T09:00:00Z", NOW)).toBe("יום שישי");
    expect(chatDayLabel("2026-09-29T07:23:00Z", NOW)).toBe("יום שלישי");
  });

  it("older than a week — the full date", () => {
    expect(chatDayLabel("2026-09-27T09:00:00Z", NOW)).toBe("27.09.2026");
    expect(chatDayLabel("2025-12-31T09:00:00Z", NOW)).toBe("31.12.2025");
  });

  it("the day follows Israel's clock, not UTC", () => {
    // 22:30 UTC on 03.10 is already 01:30 on 04.10 in Israel
    expect(chatDayLabel("2026-10-03T22:30:00Z", NOW)).toBe("היום");
    expect(israelDayKey("2026-10-03T22:30:00Z")).toBe("2026-10-04");
  });

  it("a message from the future (clock skew) shows its date, not 'today'", () => {
    expect(chatDayLabel("2026-10-06T09:00:00Z", NOW)).toBe("06.10.2026");
  });
});

describe("chatTime / chatFullDateTime", () => {
  it("Israel time, 24-hour", () => {
    expect(chatTime("2026-09-29T07:23:00Z")).toBe("10:23");
    expect(chatTime("2026-09-29T20:05:00Z")).toBe("23:05");
  });

  it("the full date for the hover", () => {
    expect(chatFullDateTime("2026-09-29T07:23:00Z")).toBe("יום שלישי, 29.09.2026 10:23");
  });
});
