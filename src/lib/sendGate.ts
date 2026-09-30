// ============================================================
// Send Gate — שער שליחה אחד לכל הודעת וואטסאפ יוצאת
// ============================================================
//
// שלוש בדיקות:
//   1. do_not_contact — מועמד/ת שביקש/ה הסרה מדיוור: כל שליחה נחסמת,
//      גם ידנית. ביטול — בפאנל הפרטיות בכרטיס המועמד.
//   2. שעות שקט — הודעות *אוטומטיות* (בוט, cron, תזכורות) לא יוצאות
//      בלילה. שליחה ידנית של רכזת מותרת בכל שעה.
//   3. שבת וחג — הודעות אוטומטיות לא יוצאות משישי 14:00 עד מוצ"ש 20:00,
//      ומערב חג 14:00 עד צאת החג 20:00. קודם השער בדק רק שעות, ותזכורות
//      ראיון, "איך הולך בעבודה" ומלווה ההגעה יצאו בשבת ובחגים.
//
// השער נאכף בתוך sendWhatsAppMessage עצמה (whatsappService.ts) —
// נקודת חנק אחת, אי אפשר לעקוף אותה בטעות מקוד חדש.

import { createClient as createServerClient } from "@supabase/supabase-js";
import { yomTovName } from "./israelHolidays";

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** צורת הטלפון הקנונית בדאטאבייס — 10 ספרות מקומיות (כמו הטריגר מ-00047). */
export function normalizeLocalPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) digits = "0" + digits.slice(3);
  return digits;
}

// ── שעות שקט ────────────────────────────────────────────────
// ברירת מחדל 22:00–08:00 שעון ישראל — מיושר עם חלון תזכורות הראיון
// הקיים (cron/daily שולח עד 22:00). ניתן לשינוי ב-env: QUIET_HOURS="22-08".

function quietWindow(): { start: number; end: number } {
  const raw = (process.env.QUIET_HOURS ?? "22-08").trim();
  const m = raw.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return { start: 22, end: 8 };
  return { start: Number(m[1]) % 24, end: Number(m[2]) % 24 };
}

function israelHour(at: Date): number {
  const part = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour12: false,
    hour: "2-digit",
  }).formatToParts(at);
  return Number(part.find((p) => p.type === "hour")?.value ?? 0) % 24;
}

export function isQuietHoursNow(at: Date = new Date()): boolean {
  const { start, end } = quietWindow();
  const hour = israelHour(at);
  // חלון שחוצה חצות (22-08) לעומת חלון רגיל (13-15)
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

// ── שבת וחג ─────────────────────────────────────────────────
// כלל פשוט ושמרני, בלי זמני כניסה מדויקים: ביום שלפני שבת/חג חוסמים
// מ-14:00, וביום עצמו עד 20:00 (צאת השבת באילת מוקדם מזה כל השנה).
// ראש השנה (יומיים) מכוסה מאליו: היום הראשון הוא גם "ערב" של השני.

export const REST_STARTS_HOUR = 14;
export const REST_ENDS_HOUR = 20;

function israelDateAndHour(at: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "שבת" או שם החג אם התאריך (YYYY-MM-DD) הוא יום מנוחה, אחרת null. */
function restDayName(date: string): string | null {
  if (new Date(`${date}T12:00:00Z`).getUTCDay() === 6) return "שבת";
  return yomTovName(date);
}

/** שם השבת/החג אם ברגע הזה אסור לשלוח הודעות אוטומטיות, אחרת null. */
export function restPeriodAt(at: Date = new Date()): string | null {
  const { date, hour } = israelDateAndHour(at);
  const today = restDayName(date);
  if (today && hour < REST_ENDS_HOUR) return today;
  const tomorrow = restDayName(addDays(date, 1));
  if (tomorrow && hour >= REST_STARTS_HOUR) return tomorrow;
  return null;
}

/** שעות שקט או שבת/חג — זמן שבו הודעות אוטומטיות לא יוצאות. */
export function isQuietTimeNow(at: Date = new Date()): boolean {
  return isQuietHoursNow(at) || restPeriodAt(at) !== null;
}

// ── תוצאת השער ──────────────────────────────────────────────

export type GateBlock = "do_not_contact" | "quiet_hours" | "gate_error";

export interface GateResult {
  allowed: boolean;
  /**
   * quiet_hours — לילה, שבת או חג (זמני: לשלוח שוב אחר כך).
   * gate_error — לא ניתן היה לבדוק הסרה מדיוור (זמני).
   * do_not_contact — ביקש/ה הסרה (סופי).
   */
  reason?: GateBlock;
  /** הודעת שגיאה בעברית, מוכנה להצגה/ללוג */
  error?: string;
}

/** חסימה זמנית: ההודעה צריכה לחכות לריצה הבאה, לא להיכשל. */
export function isTemporaryBlock(reason: GateBlock | undefined): boolean {
  return reason === "quiet_hours" || reason === "gate_error";
}

/**
 * בדיקת השער לפני שליחה. automated=true להודעות שהמערכת יוזמת
 * (בוט, cron, תזכורות); false לשליחה ידנית של רכזת. rest=true מחיל את
 * חסימת שבת/חג גם על הודעה שאינה automated (פתיחת בוט לליד טרי).
 *
 * כשל בבדיקת דגל ההסרה חוסם את השליחה (gate_error, זמני). קודם זה היה
 * fail-open, ו-supabase-js לא זורק על שגיאה — כך שכל תקלת DB שלחה
 * הודעות גם למי שביקש/ה לא לקבל.
 */
export async function checkSendGate(
  phone: string,
  opts: { automated: boolean; rest?: boolean }
): Promise<GateResult> {
  const unverified: GateResult = {
    allowed: false,
    reason: "gate_error",
    error: "לא ניתן לוודא כרגע שהמועמד/ת לא ביקש/ה הסרה — נסו שוב בעוד רגע",
  };
  try {
    const local = normalizeLocalPhone(phone);
    // בדאטאבייס הטלפונים מנורמלים (00047), אבל ליתר ביטחון בודקים גם
    // וריאנטים ישנים — אותה רשימה כמו בחיפוש הליד ב-webhook.
    const variants = [
      local,
      `${local.slice(0, 3)}-${local.slice(3)}`,
      `+972${local.slice(1)}`,
      `972${local.slice(1)}`,
    ];
    const { data, error } = await adminClient()
      .from("leads")
      .select("id")
      .in("phone", variants)
      .eq("do_not_contact", true)
      .limit(1);
    if (error) {
      console.error("[sendGate] do_not_contact check failed — blocking send:", error.message);
      return unverified;
    }

    if (data && data.length > 0) {
      return {
        allowed: false,
        reason: "do_not_contact",
        error: "המועמד/ת ביקש/ה הסרה מדיוור — השליחה נחסמה (ניתן לבטל בפאנל הפרטיות בכרטיס)",
      };
    }
  } catch (err) {
    console.error("[sendGate] do_not_contact check failed — blocking send:", err);
    return unverified;
  }

  if (opts.automated && isQuietHoursNow()) {
    const { start, end } = quietWindow();
    return {
      allowed: false,
      reason: "quiet_hours",
      error: `שעות שקט (${start}:00–${end}:00) — הודעות אוטומטיות לא נשלחות בלילה`,
    };
  }

  if (opts.automated || opts.rest) {
    const rest = restPeriodAt();
    if (rest) {
      return {
        allowed: false,
        reason: "quiet_hours",
        error: `${rest} — הודעות אוטומטיות לא נשלחות בשבת ובחג (יישלחו אחרי ${REST_ENDS_HOUR}:00)`,
      };
    }
  }

  return { allowed: true };
}

// ── זיהוי בקשת הסרה בהודעה נכנסת ────────────────────────────
// דטרמיניסטי בכוונה (לא AI): בקשת הסרה חייבת להיתפס ב-100% מהמקרים.
// שמרני בכוונה: "לא מעוניין" לבד לא נחשב — מועמד שאומר "לא מעוניין
// במשרה הזאת" לא ביקש לנתק קשר. רק ניסוחי הסרה מפורשים.

const OPT_OUT_PATTERNS = [
  /תסירו?\s+אותי/,
  /הסירו?\s+אותי/,
  /תורידו?\s+אותי/,
  /אל\s+תשלחו\s+לי/,
  /תפסיקו\s+לשלוח/,
  /תפסיקו\s+לכתוב/,
  /די\s+להודעות/,
  /לא\s+מעוניינ(ת|\/ת|ה)?\s+לקבל\s+הודעות/,
  /unsubscribe/i,
  /remove\s+me/i,
];

/** התאמה מלאה בלבד — הודעה שכולה מילת עצירה. */
const OPT_OUT_EXACT = new Set(["stop", "הסר", "הסרה"]);

export function isOptOutMessage(text: string): boolean {
  const trimmed = text.trim();
  if (OPT_OUT_EXACT.has(trimmed.toLowerCase())) return true;
  return OPT_OUT_PATTERNS.some((re) => re.test(trimmed));
}

/** הודעת האישור היחידה שיוצאת אחרי opt-out (נשלחת עם skipGate). */
export const OPT_OUT_CONFIRMATION =
  "קיבלנו 🙏 הסרנו אותך מרשימת התפוצה ולא נשלח לך יותר הודעות.\n" +
  "אם בעתיד תרצה/י בכל זאת לשמוע על משרות באילת — אפשר פשוט לכתוב לנו כאן.";
