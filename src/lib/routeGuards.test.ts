import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * כל נתיב API חייב שער.
 *
 * זו הבעיה המבנית שהסריקה של 24.09 חשפה: `src/proxy.ts` מחריג את כל
 * `/api/` מבדיקת ההתחברות, מתוך הנחה שכל נתיב שומר על עצמו. ההנחה הזו
 * נכונה ברובה — אבל נתיב חדש שנכתב בלי שער נולד פתוח לאינטרנט, בלי ששום
 * דבר יתריע. ככה `/api/chat` ו-`/api/ai/lead-summary` רצו חודשים כפרוקסי
 * פתוח ל-LLM על המפתח שלנו (אומת בפרודקשן: 200 לבקשה אנונימית).
 *
 * הטסט הזה לא בודק שהשער *נכון* — הוא בודק שיש שער. נתיב חדש בלי אף אחד
 * מהדפוסים המוכרים מפיל את הבנייה, ומי שכותב אותו חייב להחליט במפורש.
 */

const API_DIR = join(process.cwd(), "src", "app", "api");

/** דפוסי אימות מוכרים. כל אחד מהם הוא החלטה מודעת שתועדה במקום אחר. */
const GUARDS: { name: string; re: RegExp }[] = [
  { name: "session helper", re: /getAuthedUser|getAuthedContext|requireAdmin|currentUser\s*\(/ },
  { name: "api key", re: /validateApiKey/ },
  { name: "cron secret", re: /CRON_SECRET|hasCronSecret\(/ },
  { name: "machine bridge key", re: /MACHINE_BRIDGE_KEY|x-machine-key|hasMachineKey\(/ },
  { name: "ingest key", re: /MACHINE_INGEST_KEY|x-ingest-key/ },
  { name: "webhook token", re: /WEBHOOK_TOKEN|webhook_token|verifyWebhookToken|X-Hub-Signature|APP_SECRET/ },
];

/**
 * נתיבים ציבוריים בכוונה, שכל אחד מהם נשען על טוקן אקראי של 24 בייטים
 * בכתובת (randomBytes(24) — ראו signatureSend.ts / booking.ts) ועל תפוגה.
 * הרשימה קצרה בכוונה: הוספה אליה היא החלטה, לא ברירת מחדל.
 */
const PUBLIC_BY_DESIGN = new Set([
  "sign/[token]/route.ts",   // המועמד/ת חותם/ת על מסמך שנשלח אליו/ה
  "booking/[token]/route.ts", // המועמד/ת בוחר/ת מועד לראיון
  "auth/gmail/callback/route.ts", // גוגל מחזיר לכאן; מוגן בהתחברות + state חתום
  "chat/route.ts",            // נסגר 24.09 — מחזיר 404 בלבד
]);

function routeFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full, `${prefix}${entry}/`));
    else if (entry === "route.ts") out.push(`${prefix}${entry}`);
  }
  return out;
}

describe("שערי אימות בנתיבי API", () => {
  const files = routeFiles(API_DIR);

  it("יש נתיבים לבדוק בכלל", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("לכל נתיב יש שער, או שהוא ברשימת הציבוריים המכוונים", () => {
    const unguarded: string[] = [];
    for (const rel of files) {
      if (PUBLIC_BY_DESIGN.has(rel)) continue;
      const src = readFileSync(join(API_DIR, rel), "utf-8");
      // הדפוס הנפוץ ב-v1: קריאה ישירה ל-auth.getUser() וחזרה 401.
      // שני החלקים נדרשים — קריאה בלי דחייה אינה שער.
      const inlineSession = /auth\.getUser\s*\(/.test(src) && /401|redirect\(/.test(src);
      if (!inlineSession && !GUARDS.some((g) => g.re.test(src))) unguarded.push(rel);
    }
    expect(unguarded, `נתיבים ללא שער אימות:\n${unguarded.join("\n")}`).toEqual([]);
  });

  it("הרשימה הציבורית לא גדלה בשקט", () => {
    // כל תוספת כאן חושפת נתיב לאינטרנט. שינוי המספר דורש נימוק בקומיט.
    expect(PUBLIC_BY_DESIGN.size).toBe(4);
    for (const rel of PUBLIC_BY_DESIGN) {
      expect(files, `${rel} ברשימה הציבורית אבל לא קיים`).toContain(rel);
    }
  });
});
