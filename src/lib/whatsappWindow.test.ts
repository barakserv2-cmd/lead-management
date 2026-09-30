import { describe, expect, it } from "vitest";
import {
  cloudRequest,
  isWithinServiceWindow,
  SERVICE_WINDOW_HOURS,
} from "./whatsappService";

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

/**
 * שני הספקים נראים אחרת לגמרי, ואת זה גיליתי רק אחרי שכתבתי את
 * המתאם לפי מטא: 360dialog מזהים את המספר לפי מפתח ה-API, ולכן אין
 * מזהה בנתיב והאימות בכותרת משלהם. כתובת שגויה מחזירה 401 שקט.
 */
describe("cloudRequest", () => {
  it("מטא: מזהה המספר בנתיב, אימות ב-Bearer", () => {
    const r = cloudRequest(
      { instanceId: "", token: "", provider: "cloud", authStyle: "bearer", phoneNumberId: "265027330024798" },
      "TOKEN"
    );
    expect(r.url).toBe("https://graph.facebook.com/v21.0/265027330024798/messages");
    expect(r.headers.Authorization).toBe("Bearer TOKEN");
    expect(r.headers["D360-API-KEY"]).toBeUndefined();
  });

  it("360dialog: נתיב /messages בלבד, אימות בכותרת שלהם", () => {
    const r = cloudRequest(
      { instanceId: "", token: "", provider: "cloud", authStyle: "d360" },
      "KEY"
    );
    expect(r.url).toBe("https://waba-v2.360dialog.io/messages");
    expect(r.headers["D360-API-KEY"]).toBe("KEY");
    expect(r.headers.Authorization).toBeUndefined();
  });

  it("כתובת בסיס מפורשת גוברת, בלי לוכסן כפול", () => {
    const r = cloudRequest(
      { instanceId: "", token: "", provider: "cloud", authStyle: "d360", apiBase: "https://example.test/" },
      "KEY"
    );
    expect(r.url).toBe("https://example.test/messages");
  });
});
