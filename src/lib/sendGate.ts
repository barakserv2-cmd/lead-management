// ============================================================
// Send Gate — שער שליחה אחד לכל הודעת וואטסאפ יוצאת
// ============================================================
//
// שתי בדיקות, לפי שלב 2 בתוכנית העבודה:
//   1. do_not_contact — מועמד/ת שביקש/ה הסרה מדיוור: כל שליחה נחסמת,
//      גם ידנית. ביטול — בפאנל הפרטיות בכרטיס המועמד.
//   2. שעות שקט — הודעות *אוטומטיות* (בוט, cron, תזכורות) לא יוצאות
//      בלילה. שליחה ידנית של רכזת מותרת בכל שעה.
//
// השער נאכף בתוך sendWhatsAppMessage עצמה (whatsappService.ts) —
// נקודת חנק אחת, אי אפשר לעקוף אותה בטעות מקוד חדש.

import { createClient as createServerClient } from "@supabase/supabase-js";

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

// ── תוצאת השער ──────────────────────────────────────────────

export interface GateResult {
  allowed: boolean;
  reason?: "do_not_contact" | "quiet_hours";
  /** הודעת שגיאה בעברית, מוכנה להצגה/ללוג */
  error?: string;
}

/**
 * בדיקת השער לפני שליחה. automated=true להודעות שהמערכת יוזמת
 * (בוט, cron, תזכורות); false לשליחה ידנית של רכזת.
 *
 * כשל DB בבדיקת הדגל לא חוסם שליחה (fail-open) — עדיף פספוס נדיר
 * של opt-out מהשבתת כל התקשורת של העסק על תקלת רשת.
 */
export async function checkSendGate(
  phone: string,
  opts: { automated: boolean }
): Promise<GateResult> {
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
    const { data } = await adminClient()
      .from("leads")
      .select("id")
      .in("phone", variants)
      .eq("do_not_contact", true)
      .limit(1);

    if (data && data.length > 0) {
      return {
        allowed: false,
        reason: "do_not_contact",
        error: "המועמד/ת ביקש/ה הסרה מדיוור — השליחה נחסמה (ניתן לבטל בפאנל הפרטיות בכרטיס)",
      };
    }
  } catch (err) {
    console.error("[sendGate] do_not_contact check failed — allowing send:", err);
  }

  if (opts.automated && isQuietHoursNow()) {
    const { start, end } = quietWindow();
    return {
      allowed: false,
      reason: "quiet_hours",
      error: `שעות שקט (${start}:00–${end}:00) — הודעות אוטומטיות לא נשלחות בלילה`,
    };
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
