import { describe, expect, it } from "vitest";
import { describeMetaError, mapGreenApiStatus, nextDeliveryStatus } from "./deliveryStatus";

/**
 * סימוני המסירה. שני דברים חייבים להיות נכונים, אחרת הסימון משקר:
 * סטטוס לא חוזר אחורה כשעדכונים מגיעים הפוך, וכישלון מאוחר לא מוחק
 * הודעה שכבר הגיעה.
 */
describe("nextDeliveryStatus", () => {
  it("מתקדם לפי הסדר", () => {
    expect(nextDeliveryStatus(null, "sent")).toBe("sent");
    expect(nextDeliveryStatus("sent", "delivered")).toBe("delivered");
    expect(nextDeliveryStatus("delivered", "read")).toBe("read");
  });

  // מטא לא מבטיחה סדר — "נקראה" יכול להגיע לפני "נמסרה"
  it("לא חוזר אחורה כשהעדכונים מגיעים הפוך", () => {
    expect(nextDeliveryStatus("read", "delivered")).toBeNull();
    expect(nextDeliveryStatus("read", "sent")).toBeNull();
    expect(nextDeliveryStatus("delivered", "sent")).toBeNull();
  });

  it("אותו סטטוס פעמיים — אין שינוי", () => {
    expect(nextDeliveryStatus("delivered", "delivered")).toBeNull();
  });

  it("כישלון גובר על 'נשלחה' או על סטטוס לא ידוע", () => {
    expect(nextDeliveryStatus("sent", "failed")).toBe("failed");
    expect(nextDeliveryStatus(null, "failed")).toBe("failed");
  });

  // אם נסמן ❌ הודעה שהמועמד כבר קרא, רכזת תתקשר לשווא
  it("כישלון מאוחר לא מוחק הודעה שכבר נמסרה או נקראה", () => {
    expect(nextDeliveryStatus("delivered", "failed")).toBeNull();
    expect(nextDeliveryStatus("read", "failed")).toBeNull();
  });

  it("אחרי כישלון, רק הוכחה שההודעה הגיעה משנה את הסטטוס", () => {
    expect(nextDeliveryStatus("failed", "delivered")).toBe("delivered");
    expect(nextDeliveryStatus("failed", "read")).toBe("read");
    expect(nextDeliveryStatus("failed", "sent")).toBeNull();
  });
});

describe("describeMetaError", () => {
  it("מתרגם את הקודים הנפוצים להנחיה ברורה", () => {
    expect(describeMetaError([{ code: 131026 }])).toContain("לא בוואטסאפ");
    expect(describeMetaError([{ code: 131047 }])).toContain("24 שעות");
    expect(describeMetaError([{ code: 131049 }])).toContain("שיווקיות");
  });

  it("קוד לא מוכר — משתמש בפרטים של מטא, לא ממציא", () => {
    expect(describeMetaError([{ code: 999, error_data: { details: "Something specific" } }])).toContain(
      "Something specific"
    );
    expect(describeMetaError([{ code: 998 }])).toContain("998");
  });

  it("בלי פירוט — אומר שאין סיבה, לא מנחש", () => {
    expect(describeMetaError(undefined)).toContain("לא מסרה סיבה");
  });
});

describe("mapGreenApiStatus", () => {
  it("סטטוסים רגילים עוברים כמו שהם", () => {
    expect(mapGreenApiStatus("delivered")).toEqual({ status: "delivered", error: null });
    expect(mapGreenApiStatus("read")).toEqual({ status: "read", error: null });
  });

  it("סוגי הכישלון של GreenAPI הופכים ל'נכשלה' עם הסבר", () => {
    expect(mapGreenApiStatus("noAccount")?.status).toBe("failed");
    expect(mapGreenApiStatus("noAccount")?.error).toContain("לא רשום בוואטסאפ");
    expect(mapGreenApiStatus("yellowCard")?.status).toBe("failed");
  });

  it("סטטוס ביניים — מתעלמים ומחכים לבא", () => {
    expect(mapGreenApiStatus("pending")).toBeNull();
    expect(mapGreenApiStatus(undefined)).toBeNull();
  });
});
