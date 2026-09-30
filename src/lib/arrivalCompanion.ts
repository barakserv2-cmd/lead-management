// ============================================================
// מלווה ההגעה — ליווי אוטומטי מה"כן, מגיע" ועד ההגעה לאילת
// ============================================================
//
// כמעט כל מי שמגיע לאילת מתקבל, אבל כשליש ממי שאמר "מגיע" לא מגיע —
// ביומיים עד שבוע שבין השיחה לנסיעה. המלווה נוגע במועמד בנקודות הקבועות,
// ומרים דגל לרכזת ברגע שיש סימן לבעיה, כשעוד אפשר להציל.
//
// נקודות מגע (רק לראיון פרונטלי, ומהמספר העסקי):
//   confirm      — אחרי שנקבע ראיון ≥2 ימים קדימה: אישור מועד, "עם חבר?"
//                  (אם עוד לא ידוע), ובדיקת נסיעה אם הראיון בעוד יומיים.
//   travel_check — יומיים לפני: "יש כרטיס? באיזו שעה יוצאים?"
//   (ערב לפני — התזכורת הקיימת ב-16:30, cron/daily)
//   day_of       — בוקר הראיון, 08:00–10:00, רק כשהראיון ב-11:00 ומעלה.
// דגלים לרכזת:
//   silent       — לא ענה 24 שעות אחרי confirm/travel_check (arrivalCompanionRun.ts).
//   תשובה עם סימן היסוס / ביטול / "החבר התחרט" — מזוהה ב-webhook.
//
// המלווה לעולם לא משנה סטטוס ולא מבטיח תנאים. לא שולח בשבת; שעות השקט
// נאכפות גם בשער השליחה (automated).
//
// הפעלה: ARRIVAL_COMPANION_MODE=live (ברירת מחדל off).
// פיילוט: ARRIVAL_COMPANION_TEST_PHONES="0501234567,..." — פעיל רק להם
// גם כשהמצב off.
//
// אידמפוטנטיות: cron_reminders.occurrence_key = arrival:{touch}:{lead}:{YYYY-MM-DD}
// הריצה עצמה (שליחה) ב-arrivalCompanionRun.ts — כאן רק לוגיקה טהורה ובדיקות.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LeadStatus } from "./stateMachine";

export type TouchType = "confirm" | "travel_check" | "day_of";

export const ARRIVAL_WINDOW_STATUSES: string[] = [LeadStatus.INTERVIEW_BOOKED, LeadStatus.POSTPONED_ARRIVAL];

/** שעות שליחה לנקודות המגע (שעון ישראל). */
const DAYTIME_START = 10;
const DAYTIME_END = 20;
const DAY_OF_START = 8;
const DAY_OF_END = 10;
/** הודעת בוקר רק כשיש זמן לפני הראיון — ראיון ב-09:00 כבר בדרך. */
const DAY_OF_MIN_INTERVIEW_HOUR = 11;

// ── Config ──────────────────────────────────────────────────

function digitsOf(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "").replace(/^972/, "0");
}

export function arrivalCompanionEnabledFor(phone: string | null | undefined): boolean {
  const mode = (process.env.ARRIVAL_COMPANION_MODE ?? "off").trim().toLowerCase();
  if (mode === "live") return true;
  const pilot = (process.env.ARRIVAL_COMPANION_TEST_PHONES ?? "")
    .split(",")
    .map((s) => digitsOf(s))
    .filter(Boolean);
  const d = digitsOf(phone);
  return !!d && pilot.includes(d);
}

// ── Planning (pure) ─────────────────────────────────────────

export interface PlanInput {
  /** ימי לוח עד הראיון (0 = היום) */
  daysAhead: number;
  /** שעת הראיון, או null כשנקבע תאריך בלבד */
  interviewHour: number | null;
  /** השעה עכשיו בישראל */
  hourNow: number;
  /** נקודות מגע שכבר נשלחו לתאריך הראיון הזה */
  sent: Set<TouchType>;
  /** מהן — שנשלחו היום */
  sentToday: Set<TouchType>;
  /** 6 = שבת */
  weekday: number;
}

/** איזו נקודת מגע לשלוח עכשיו — לכל היותר אחת לריצה. */
export function planTouch(p: PlanInput): TouchType | null {
  if (p.weekday === 6) return null;
  if (p.sentToday.size > 0) return null; // הודעה יזומה אחת ביום

  if (p.daysAhead === 0) {
    const late = p.interviewHour === null || p.interviewHour >= DAY_OF_MIN_INTERVIEW_HOUR;
    if (late && !p.sent.has("day_of") && p.hourNow >= DAY_OF_START && p.hourNow < DAY_OF_END) return "day_of";
    return null;
  }

  if (p.hourNow < DAYTIME_START || p.hourNow >= DAYTIME_END) return null;
  if (p.daysAhead >= 2 && !p.sent.has("confirm")) return "confirm";
  // האישור נשלח ביום קודם — עכשיו בדיקת הנסיעה. אם הוא נשלח היום, הוא
  // כבר שאל על הנסיעה (includeTravel) והתנאי sentToday עצר אותנו למעלה.
  if (p.daysAhead === 2 && !p.sent.has("travel_check")) return "travel_check";
  return null;
}

// ── Messages ────────────────────────────────────────────────

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}

/** "ביום שלישי 30.9 בשעה 10:00" — interview_date הוא שעון קיר ישראלי עם תווית UTC. */
export function whenLabel(interviewDate: string): string {
  const d = new Date(interviewDate);
  const day = `ביום ${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  if (hh === 0 && mm === 0) return day;
  return `${day} בשעה ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function touchMessage(
  touch: TouchType,
  lead: { name: string | null; interview_date: string; comes_with_friend: boolean | null },
  daysAhead: number
): string {
  const n = firstName(lead.name);
  const hi = n ? `היי ${n}` : "היי";
  const when = whenLabel(lead.interview_date);

  if (touch === "confirm") {
    const lines = [`${hi} 😊 כאן ברק שירותים. שמחים שאת/ה מגיע/ה לאילת! הראיון נקבע ${when}.`];
    if (lead.comes_with_friend == null) {
      lines.push("מגיע/ה לבד או עם חבר/ה? אם עם חבר/ה, כתוב/י לי את השם ונסדר לכם הכל ביחד 🙏");
    }
    if (daysAhead === 2) lines.push("כבר יש כרטיס לאוטובוס? באיזו שעה יוצאים?");
    lines.push("אם משהו משתנה, פשוט כתוב/י לי כאן.");
    return lines.join("\n");
  }
  if (touch === "travel_check") {
    return (
      `${hi}, עוד יומיים הראיון באילת 🙂\n` +
      `כבר יש כרטיס לאוטובוס? באיזו שעה יוצאים?\n` +
      `אם צריך עזרה עם משהו לפני הנסיעה, אני כאן.`
    );
  }
  const d = new Date(lead.interview_date);
  const hasTime = !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0);
  const at = hasTime
    ? ` בשעה ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
    : "";
  return `בוקר טוב${n ? ` ${n}` : ""} ☀️ היום הראיון שלך באילת${at}. בהצלחה!\nאם משהו השתנה בדרך, כתוב/י לי כאן ונסתדר.`;
}

// ── Reply signals (pure) ────────────────────────────────────

export type ArrivalRisk = "none" | "hesitant" | "cancelling";

export interface ArrivalSignals {
  risk: ArrivalRisk;
  friendBackedOut: boolean;
  /** true = מגיע עם מישהו, false = לבד, null = לא נאמר */
  comesWithFriend: boolean | null;
}

/** לפני ההגעה, או בימים הראשונים בעבודה (שם רוב העזיבות קורות — 0–3 ימים). */
export type SignalPhase = { kind: "arrival" } | { kind: "first_days"; day: number };

// גבולות מילה ידניים — \b לא עובד על אותיות עבריות, ובלעדיהם "אח" נתפס בתוך "אחרי".
// מותרת ו' החיבור בתחילת המילה ("והחבר").
const FRIEND =
  "(?<![א-ת])ו?(?:ה?חבר(?:ה|ים|ות)?|ה?אח(?:ות)?|בן דוד|בת דודה|בן הזוג|בת הזוג|בן זוג|בת זוג)(?![א-ת])";

const CANCELLING = new RegExp(
  [
    "לא\\s+(?:א|נ)גיע",
    "לא\\s+מגיע(?:ה|ים)?",
    "לא\\s+(?:א|נ)בוא",
    "לא\\s+יכול(?:ה)?\\s+להגיע",
    "מבטל(?:ת|ים)?",
    "לבטל",
    "ביטלתי",
    "מצאתי\\s+עבודה",
    "כבר\\s+לא\\s+רלוונטי",
    "לא\\s+מתאים\\s+לי",
  ].join("|")
);

// רק אחרי תחילת העבודה — לפני ההגעה "האוטובוס עוזב ב-8" היה נתפס כביטול
const LEAVING = new RegExp(
  [
    "(?<![א-ת])עוזב(?:ת|ים)?(?![א-ת])",
    "רוצה\\s+לעזוב",
    "חוזר(?:ת|ים)?\\s+הביתה",
    "לא\\s+נשאר(?:ת|ים)?",
    "התפטר(?:תי)?",
    "לא\\s+מתאים\\s+לי",
    "לא\\s+(?:מגיע|מגיעה|אגיע)\\s+(?:מחר|לעבודה|למשמרת)",
  ].join("|")
);

const HESITANT = new RegExp(
  [
    "לא\\s+בטוח(?:ה)?",
    "אולי",
    "לדחות",
    "(?:ב)?שבוע\\s+הבא",
    "עוד\\s+לא\\s+יודע(?:ת)?",
    "צריך\\s+לחשוב",
    "צריכה\\s+לחשוב",
    "אחשוב",
    "התחרט(?:תי|נו)?",
    "קרה\\s+משהו",
    // קשיים בימים הראשונים
    "קשה\\s+לי",
    "לא\\s+מסתדר(?:ת)?",
    "(?:דירה|מגורים|חדר)[^.!?\\n]{0,25}(?:מלוכלך|מלוכלכת|לא\\s+נקי|אין\\s+מזגן|מזגן\\s+לא|גרוע|נורא|זוועה)",
  ].join("|")
);

const FRIEND_BACKED_OUT = new RegExp(
  `${FRIEND}[^.!?\\n]{0,25}(?:לא\\s+(?:מגיע|מגיעה|בא|באה|יכול|יכולה|יבוא|תבוא)|התחרט|ביטל|ויתר|נשאר|נשארה)` +
    `|(?:התחרט|התחרטה|ויתר|ויתרה|ביטל|ביטלה)[^.!?\\n]{0,15}${FRIEND}`
);

const WITH_FRIEND = new RegExp(`(?:עם|יחד\\s+עם)\\s+${FRIEND}|נגיע\\s+(?:ביחד|שניים)|אנחנו\\s+שניים|מגיעים\\s+שניים`);
const ALONE = /(?:^|\s)לבד(?:\s|$|[.!?,])/;

export function detectArrivalSignals(text: string, phase: SignalPhase["kind"] = "arrival"): ArrivalSignals {
  const t = text.replace(/\s+/g, " ").trim();
  const friendBackedOut = FRIEND_BACKED_OUT.test(t);
  // "החבר שלי לא מגיע" הוא ביטול של החבר, לא של המועמד — בודקים ביטול בלי המשפט הזה
  const own = friendBackedOut ? t.replace(new RegExp(FRIEND_BACKED_OUT.source, "g"), " ") : t;
  let risk: ArrivalRisk = "none";
  const quitting = phase === "first_days" ? LEAVING : CANCELLING;
  if (quitting.test(own)) risk = "cancelling";
  else if (HESITANT.test(t) || friendBackedOut) risk = "hesitant";
  // "החבר התחרט, אני מגיע לבד" — עדיין מגיע, אבל כדאי שרכזת תדע
  const comesWithFriend = friendBackedOut || ALONE.test(t) ? false : WITH_FRIEND.test(t) ? true : null;
  return { risk, friendBackedOut, comesWithFriend };
}

export function signalReason(
  s: ArrivalSignals,
  name: string | null,
  text: string,
  phase: SignalPhase = { kind: "arrival" }
): string | null {
  if (s.risk === "none" && !s.friendBackedOut) return null;
  const who = name ?? "המועמד/ת";
  const quote = `"${text.slice(0, 80)}"`;
  if (phase.kind === "first_days") {
    const what = s.risk === "cancelling" ? "נראה שרוצה לעזוב" : s.friendBackedOut ? "החבר/ה עזב/ה" : "מתקשה";
    return `🚩 מלווה ההגעה: ${who} — ביום ${phase.day} לעבודה ${what}. ${quote} — כדאי להתקשר היום`;
  }
  const what = s.friendBackedOut
    ? "החבר/ה שהיה אמור/ה להגיע התחרט/ה"
    : s.risk === "cancelling"
      ? "נראה שמבטל/ת את ההגעה"
      : "מתלבט/ת לגבי ההגעה";
  return `🚩 מלווה ההגעה: ${who} — ${what}. ${quote} — כדאי להתקשר עכשיו`;
}

// ── First days at work ──────────────────────────────────────

/** כמה ימים מתחילת העבודה המלווה עדיין מקשיב לתשובות. */
export const FIRST_DAYS_WINDOW = 7;

/**
 * הודעת "איך היה היום הראשון" — יום או יומיים אחרי ההתחלה (יומיים כדי לתפוס
 * התחלה ביום שישי). בדיקת השלומות של יום 3 (postPlacement) נשארת כמו שהיא.
 */
export function planFirstDayTouch(p: { daysSinceStart: number; hourNow: number; weekday: number; sent: boolean }): boolean {
  if (p.sent || p.weekday === 6) return false;
  if (p.hourNow < DAYTIME_START || p.hourNow >= DAYTIME_END) return false;
  return p.daysSinceStart === 1 || p.daysSinceStart === 2;
}

export function firstDayMessage(lead: { name: string | null; hired_client: string | null }): string {
  const n = firstName(lead.name);
  const at = lead.hired_client ? ` ב${lead.hired_client}` : "";
  return (
    `${n ? `היי ${n}` : "היי"} 👋 כאן ברק שירותים. איך היה היום הראשון${at}?\n` +
    `הכל בסדר עם המגורים והמשמרות? אם משהו לא מסתדר, כתוב/י לי ונטפל בזה מהר 🙏`
  );
}

function daysSince(date: string, now: Date): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
  return Math.round(
    (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000
  );
}

/**
 * נקרא מה-webhook על הודעה נכנסת. פועל על מועמד בדרך לראיון באילת, ועל עובד
 * בשבוע הראשון שלו בעבודה. best-effort: כל כשל כאן לא עוצר את עיבוד ההודעה.
 */
export async function applyArrivalSignals(
  db: SupabaseClient,
  lead: { id: string; name: string | null; status: string | null },
  text: string
): Promise<void> {
  if (!lead.status) return;
  const preArrival = ARRIVAL_WINDOW_STATUSES.includes(lead.status);
  const working = lead.status === LeadStatus.HIRED || lead.status === LeadStatus.STARTED;
  if (!preArrival && !working) return;

  const { data: cur, error } = await db
    .from("leads")
    .select("comes_with_friend, start_date")
    .eq("id", lead.id)
    .maybeSingle();
  if (error) return;

  let phase: SignalPhase = { kind: "arrival" };
  if (working) {
    const start = cur?.start_date as string | null;
    if (!start) return;
    const day = daysSince(start, new Date());
    if (day < 0 || day > FIRST_DAYS_WINDOW) return;
    phase = { kind: "first_days", day };
  }

  const s = detectArrivalSignals(text, phase.kind);
  const reason = signalReason(s, lead.name, text, phase);
  const updates: Record<string, unknown> = {};

  if (reason) {
    updates.needs_attention = true;
    updates.needs_attention_at = new Date().toISOString();
    updates.attention_reason = reason;
  }
  // "עם חבר / לבד" רלוונטי רק לפני ההגעה. לא דורסים מה שהרכזת כבר סימנה —
  // חוץ מ"החבר התחרט", שמשנה את המצב בפועל.
  if (phase.kind === "arrival" && s.comesWithFriend !== null && (cur?.comes_with_friend == null || s.friendBackedOut)) {
    updates.comes_with_friend = s.comesWithFriend;
  }
  if (Object.keys(updates).length === 0) return;

  await db.from("leads").update(updates).eq("id", lead.id);
  if (reason) {
    await db.from("lead_events").insert({
      lead_id: lead.id,
      event_type: "ליווי הגעה",
      event_text: reason,
      created_by: "מלווה ההגעה",
    });
  }
}
