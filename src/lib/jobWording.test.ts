import { describe, expect, it } from "vitest";
import { checkJobWording } from "./jobWording";

/**
 * שלוש המשרות שנמצאו בפועל שידרו את הניסוחים האלה למועמדים דרך גובגט.
 * הטסטים נועלים אותם, ובאותה מידה נועלים את מה שמותר — בדיקה שחוסמת
 * דרישה מקצועית לגיטימית תגרום לרכזות לעקוף אותה.
 */
describe("checkJobWording", () => {
  it("חוסם את שלושת הניסוחים שנמצאו במערכת", () => {
    expect(checkJobWording("בנות יפות | מגורים: יש")?.what).toBe("מראה חיצוני");
    expect(checkJobWording("עדיפות לבנות אנגלית צריך")?.what).toBe("מין");
    expect(checkJobWording("עדיפות לרוסים")?.what).toBe("מוצא או לאום");
  });

  it("חוסם גיל, מצב משפחתי ודת", () => {
    expect(checkJobWording("עד גיל 30")?.what).toBe("גיל");
    expect(checkJobWording("רווק ללא ילדים")?.what).toBe("מצב משפחתי או הריון");
    expect(checkJobWording("רק שומרי שבת")?.what).toBe("דת");
  });

  it("מאפשר דרישות מקצועיות — כולל אלה שדומות למילים החסומות", () => {
    for (const ok of [
      "יתרון לדוברי רוסית",
      "אנגלית ברמה טובה — נדרש לשיחה מול אורחים",
      "הופעה ייצוגית · יחסי אנוש טובים | מגורים: יש",
      "שירות צבאי מלא חובה",
      "עדיפות לבעלי ניסיון קודם",
      "זמינות למשמרות שבת",
      "ניסיון של שנתיים לפחות",
      "תעודת חשמלאי חובה",
    ]) {
      expect(checkJobWording(ok), ok).toBeNull();
    }
  });

  it("טקסט ריק אינו בעיה", () => {
    expect(checkJobWording("")).toBeNull();
    expect(checkJobWording("   ")).toBeNull();
  });
});
