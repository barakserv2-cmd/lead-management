import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { verifyBearerSecret, verifyMetaSignature, phoneFromChatId } from "./whatsappService";
import { extractText } from "@/app/api/whatsapp/cloud/[token]/route";

/**
 * הקליטה מהערוץ הרשמי. שני דברים נשברים כאן בשקט ולכן נבדקים:
 * חתימה שמתקבלת כשהיא לא צריכה (webhook פתוח), והודעה שנבלעת
 * כי מטא עטפה אותה במבנה שלא ציפינו לו.
 */

const SECRET = "app-secret-123";
const BODY = JSON.stringify({ entry: [{ changes: [] }] });
const sign = (body: string, secret: string) =>
  "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");

describe("verifyMetaSignature", () => {
  it("מקבל חתימה אמיתית של מטא", () => {
    expect(verifyMetaSignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it("מקבל גם בלי הקידומת sha256=", () => {
    const bare = sign(BODY, SECRET).slice(7);
    expect(verifyMetaSignature(BODY, bare, SECRET)).toBe(true);
  });

  it("דוחה חתימה שנחתמה בסוד אחר", () => {
    expect(verifyMetaSignature(BODY, sign(BODY, "wrong-secret"), SECRET)).toBe(false);
  });

  it("דוחה כשהגוף שונה במשהו — ולו תו אחד", () => {
    expect(verifyMetaSignature(BODY + " ", sign(BODY, SECRET), SECRET)).toBe(false);
  });

  // זו הנקודה שבגללה הבדיקה קיימת: בלי App Secret מוגדר בסביבה,
  // הפיתוי הוא "לא לאכוף כדי שיעבוד מקומית". זה webhook פתוח.
  it("דוחה כשאין App Secret מוגדר", () => {
    expect(verifyMetaSignature(BODY, sign(BODY, SECRET), "")).toBe(false);
  });

  it("דוחה כשאין כותרת חתימה בכלל", () => {
    expect(verifyMetaSignature(BODY, null, SECRET)).toBe(false);
  });

  it("דוחה חתימה באורך שגוי בלי לזרוק", () => {
    expect(verifyMetaSignature(BODY, "sha256=abc", SECRET)).toBe(false);
  });
});

describe("extractText", () => {
  it("טקסט רגיל", () => {
    expect(extractText({ type: "text", text: { body: "  שלום  " } })).toBe("שלום");
  });

  it("לחיצה על כפתור בתבנית", () => {
    expect(extractText({ type: "button", button: { text: "כן" } })).toBe("כן");
  });

  it("בחירה מרשימה או מכפתור אינטראקטיבי", () => {
    expect(
      extractText({ type: "interactive", interactive: { button_reply: { title: "מעוניין" } } })
    ).toBe("מעוניין");
    expect(
      extractText({ type: "interactive", interactive: { list_reply: { title: "אילת" } } })
    ).toBe("אילת");
  });

  it("מדיה לא נבלעת בשקט — נרשם טקסט שהרכז/ת תראה בשיחה", () => {
    expect(extractText({ type: "image" })).toContain("קובץ");
    expect(extractText({ type: "audio" })).toContain("קולית");
  });

  it("סוג לא מוכר או הודעה ריקה מדולגים", () => {
    expect(extractText({ type: "reaction" })).toBeNull();
    expect(extractText({ type: "text", text: { body: "   " } })).toBeNull();
    expect(extractText({})).toBeNull();
  });
});

describe("ניתוב מספר מהפורמט של מטא", () => {
  // מטא שולחת בינלאומי בלי +, והלידים בדאטהבייס שמורים מקומי
  it("מתרגם 972 לאפס מוביל", () => {
    expect(phoneFromChatId("972501234567")).toBe("0501234567");
  });
});

/**
 * דרך ספק אין חתימה על הגוף — 360dialog מקבלים ממטא ושולחים הלאה
 * משרתיהם. כל האימות הוא סוד בכותרת, ולכן שני מצבי הכשל המסוכנים
 * נבדקים במפורש: סוד ריק בדאטהבייס, וכותרת חסרה.
 */
describe("verifyBearerSecret", () => {
  const SEC = "6f1c9a2e-3b7d-4c81-9e55-0a2d4b8f6c13";

  it("מקבל את הסוד הנכון עם וגם בלי Bearer", () => {
    expect(verifyBearerSecret(`Bearer ${SEC}`, SEC)).toBe(true);
    expect(verifyBearerSecret(SEC, SEC)).toBe(true);
  });

  it("דוחה סוד שגוי באותו אורך", () => {
    const wrong = SEC.slice(0, -1) + (SEC.endsWith("3") ? "4" : "3");
    expect(verifyBearerSecret(`Bearer ${wrong}`, SEC)).toBe(false);
  });

  // חשבון בלי סוד הוא חשבון בלי אימות. עדיף שייכשל מאשר שיקבל הכל.
  it("דוחה כשאין סוד על החשבון", () => {
    expect(verifyBearerSecret(`Bearer ${SEC}`, null)).toBe(false);
    expect(verifyBearerSecret(`Bearer ${SEC}`, "   ")).toBe(false);
  });

  it("דוחה כשאין כותרת", () => {
    expect(verifyBearerSecret(null, SEC)).toBe(false);
  });

  it("דוחה אורך שגוי בלי לזרוק", () => {
    expect(verifyBearerSecret("Bearer x", SEC)).toBe(false);
  });
});
