import { describe, expect, it } from "vitest";
import { isStaffedHour, recipientFor } from "./missedCallAlert";

// שעון קיץ ישראל = UTC+3 עד סוף אוקטובר 2026
const il = (date: string, hh: number, mm = 0) =>
  new Date(`${date}T${String(hh - 3).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);

describe("isStaffedHour", () => {
  it("Sunday–Thursday 08:00–17:00 is staffed", () => {
    expect(isStaffedHour(il("2026-10-11", 8))).toBe(true); // ראשון
    expect(isStaffedHour(il("2026-10-15", 16, 59))).toBe(true); // חמישי
  });

  it("after 17:00 and before 08:00 waits for the morning", () => {
    expect(isStaffedHour(il("2026-10-12", 17))).toBe(false);
    expect(isStaffedHour(il("2026-10-12", 7, 59))).toBe(false);
  });

  it("Friday and Saturday belong to Gubget alone", () => {
    expect(isStaffedHour(il("2026-10-16", 10))).toBe(false); // שישי
    expect(isStaffedHour(il("2026-10-17", 10))).toBe(false); // שבת
  });

  it("a holiday is not staffed", () => {
    // שמיני עצרת / שמחת תורה תשפ"ז — 3.10.2026 (שבת בכל מקרה); ראש השנה תשפ"ז — 12.9.2026
    expect(isStaffedHour(il("2026-09-12", 10))).toBe(false);
  });
});

describe("recipientFor", () => {
  it("routes to the recruiter who holds the lead", () => {
    expect(recipientFor("tami@eilatjobs.com")).toBe("תמי");
    expect(recipientFor("Hoshen@eilatjobs.com")).toBe("חושן");
  });

  it("falls back to both recruiters when nobody specific holds it", () => {
    expect(recipientFor("gubget@eilatjobs.com")).toBe("recruiters");
    expect(recipientFor("barakserv@eilatjobs.com")).toBe("recruiters");
    expect(recipientFor(null)).toBe("recruiters");
  });
});
