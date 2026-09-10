import { describe, expect, it } from "vitest";
import { closureFor, isBookableMinute, isClosedDay, closuresBetween } from "./israelHolidays";

/**
 * גובגט קבע ראיון טלפוני לאנסטסיה רפאלוב ביום ראשון 13/09/2026 בשעה 12:30 —
 * ראש השנה ב׳, כשהמשרד סגור. הטסטים האלה נועלים את התאריכים האמיתיים, כדי
 * שמעבר לשנה עברית אחרת או שינוי בחישוב לא יחזירו את התקלה בשקט.
 */
describe("closureFor", () => {
  it("סוגר את היום שבו נקבע הראיון בפועל", () => {
    const c = closureFor("2026-09-13");
    expect(c.closed).toBe(true);
    expect(c.name).toBe("ראש השנה ב׳");
    expect(isBookableMinute("2026-09-13", 12 * 60 + 30)).toBe(false);
  });

  it("מזהה את ימי תשרי 5787 הנכונים", () => {
    expect(closureFor("2026-09-12").name).toBe("ראש השנה א׳");
    expect(closureFor("2026-09-21").name).toBe("יום כיפור");
    expect(closureFor("2026-09-26").name).toBe("סוכות א׳");
    expect(closureFor("2026-10-03").name).toBe("שמיני עצרת ושמחת תורה");
  });

  it("מזהה ערבי חג כיום קצר ולא כסגירה", () => {
    const erev = closureFor("2026-09-11"); // ערב ראש השנה
    expect(erev.closed).toBe(false);
    expect(erev.halfDay).toBe(true);
    expect(isBookableMinute("2026-09-11", 10 * 60)).toBe(true);
    expect(isBookableMinute("2026-09-11", 14 * 60)).toBe(false);
  });

  it("משאיר יום עבודה רגיל פתוח", () => {
    expect(isClosedDay("2026-09-10")).toBe(false);
    expect(isClosedDay("2026-09-14")).toBe(false);
    expect(isBookableMinute("2026-09-14", 15 * 60)).toBe(true);
  });

  it("עובד גם על שנה עברית אחרת — פסח ושבועות 2027", () => {
    // 15 בניסן ה׳תשפ״ז ו-6 בסיוון ה׳תשפ״ז
    expect(closureFor("2027-04-22").name).toBe("פסח א׳");
    expect(closureFor("2027-04-28").name).toBe("שביעי של פסח");
    expect(closureFor("2027-06-11").name).toBe("שבועות");
  });

  it("מוצא את כל ימי הסגירה בטווח תשרי", () => {
    const found = closuresBetween("2026-09-10", 25);
    const closed = found.filter((f) => f.info.closed).map((f) => f.date);
    expect(closed).toEqual([
      "2026-09-12",
      "2026-09-13",
      "2026-09-21",
      "2026-09-26",
      "2026-10-03",
    ]);
  });
});
