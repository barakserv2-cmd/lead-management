// ============================================================
// Interview self-booking — חישוב חלונות פנויים ועזרי זמן
// ============================================================
//
// קונבנציית אזור-הזמן של המערכת (ראו docs): תאריכי ראיון נשמרים
// כשעון-קיר ישראלי עם תווית UTC. לכן כל החישובים כאן עובדים על
// "תאריכים מזויפים" — מחרוזות YYYY-MM-DD ושדות getUTC* בלבד,
// ואף פעם לא Asia/Jerusalem על ערך שנקרא מהדאטאבייס.

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** זמן מינימלי מראש להזמנה (דקות) — שלא ייקבע ראיון בעוד רבע שעה. */
export const MIN_LEAD_MINUTES = 180;
/** כמה ימים קדימה מציעים חלונות. */
export const BOOKING_DAYS_AHEAD = 14;
/** תקרת חלונות שמוחזרת לדף — שומר על העמוד קליל במובייל. */
export const MAX_SLOTS_RETURNED = 36;

export const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function newBookingToken(): string {
  return randomBytes(24).toString("base64url");
}

/** השעה עכשיו בישראל, כשעון קיר: תאריך YYYY-MM-DD ודקות מתחילת היום. */
export function israelNow(): { dateStr: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0=ראשון … 6=שבת, על תאריך-קיר. */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** בונה ערך starts_at בקונבנציית המערכת: שעון-קיר עם תווית Z. */
export function slotIso(dateStr: string, minute: number): string {
  return `${dateStr}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}:00Z`;
}

/** "2026-09-03T10:20:00Z" → { dayName: "חמישי", date: "03.09", time: "10:20" } */
export function formatSlot(startsAt: string): { dayName: string; date: string; time: string } {
  const d = new Date(startsAt);
  return {
    dayName: HEBREW_DAYS[d.getUTCDay()],
    date: `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

export interface AvailabilityWindow {
  weekday: number;
  start_minute: number;
  end_minute: number;
  slot_minutes: number;
}

/**
 * החלונות הפנויים של רכזת ל-14 הימים הקרובים: חלונות השבועיות שלה,
 * פחות מה שכבר הוזמן, פחות העבר (+3 שעות מראש).
 */
export async function listOpenSlots(
  admin: SupabaseClient,
  recruiterEmail: string
): Promise<string[]> {
  const { data: windows } = await admin
    .from("availability_slots")
    .select("weekday, start_minute, end_minute, slot_minutes")
    .eq("recruiter_email", recruiterEmail.toLowerCase())
    .eq("active", true);

  if (!windows || windows.length === 0) return [];

  const now = israelNow();
  const rangeEnd = addDays(now.dateStr, BOOKING_DAYS_AHEAD);

  const { data: booked } = await admin
    .from("interview_bookings")
    .select("starts_at")
    .eq("recruiter_email", recruiterEmail.toLowerCase())
    .eq("status", "booked")
    .gte("starts_at", `${now.dateStr}T00:00:00Z`)
    .lte("starts_at", `${rangeEnd}T23:59:59Z`);

  const taken = new Set(
    (booked ?? []).map((b) => new Date(b.starts_at as string).toISOString().replace(".000Z", "Z"))
  );

  const slots: string[] = [];
  for (let offset = 0; offset <= BOOKING_DAYS_AHEAD && slots.length < MAX_SLOTS_RETURNED; offset++) {
    const dateStr = addDays(now.dateStr, offset);
    const wd = weekdayOf(dateStr);
    const dayWindows = (windows as AvailabilityWindow[])
      .filter((w) => w.weekday === wd)
      .sort((a, b) => a.start_minute - b.start_minute);

    for (const w of dayWindows) {
      for (
        let m = w.start_minute;
        m + w.slot_minutes <= w.end_minute && slots.length < MAX_SLOTS_RETURNED;
        m += w.slot_minutes
      ) {
        if (offset === 0 && m < now.minutes + MIN_LEAD_MINUTES) continue;
        const iso = slotIso(dateStr, m);
        if (!taken.has(iso)) slots.push(iso);
      }
    }
  }
  return slots;
}

/** הבסיס לבניית לינקים ציבוריים — env בפרודקשן, origin בפיתוח. */
export function appBaseUrl(requestOrigin: string): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit && !explicit.includes("localhost")) return explicit;
  return requestOrigin.replace(/\/$/, "");
}
