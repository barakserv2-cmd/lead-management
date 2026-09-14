import { describe, expect, it } from "vitest";
import { isWithinServiceWindow, SERVICE_WINDOW_HOURS } from "./whatsappService";

/**
 * חלון 24 השעות של מטא. ב-GreenAPI רכזת יכלה לכתוב למי שרצתה ומתי
 * שרצתה; בערוץ הרשמי טקסט חופשי מותר רק אם המועמד/ת כתבו ביממה
 * האחרונה. הגבול הזה נשבר בשקט — ההודעה פשוט נדחית — ולכן הוא נבדק.
 */

const NOW = new Date("2026-09-14T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("isWithinServiceWindow", () => {
  it("מאפשר טקסט חופשי כל עוד המועמד/ת כתבו ביממה האחרונה", () => {
    expect(isWithinServiceWindow(hoursAgo(0), NOW)).toBe(true);
    expect(isWithinServiceWindow(hoursAgo(6), NOW)).toBe(true);
    expect(isWithinServiceWindow(hoursAgo(23.9), NOW)).toBe(true);
  });

  it("נסגר בדיוק ב-24 שעות", () => {
    expect(isWithinServiceWindow(hoursAgo(SERVICE_WINDOW_HOURS), NOW)).toBe(false);
    expect(isWithinServiceWindow(hoursAgo(25), NOW)).toBe(false);
    expect(isWithinServiceWindow(hoursAgo(72), NOW)).toBe(false);
  });

  it("מועמד/ת שמעולם לא כתבו — מחוץ לחלון", () => {
    expect(isWithinServiceWindow(null, NOW)).toBe(false);
  });

  it("חותמת עתידית לא פותחת את החלון", () => {
    // שעון מוטה או רשומה פגומה לא יהפכו שיחה סגורה לפתוחה
    expect(isWithinServiceWindow(hoursAgo(-2), NOW)).toBe(false);
  });
});
