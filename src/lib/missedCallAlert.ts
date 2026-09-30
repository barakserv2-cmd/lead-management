import type { SupabaseClient } from "@supabase/supabase-js";
import { alertViaGubget, type AlertRecipient } from "@/lib/gubgetAlert";
import { isClosedDay } from "@/lib/israelHolidays";
import { STATUS_LABELS, type LeadStatusValue } from "@/lib/stateMachine";

// ============================================================
// מועמד קיים התקשר ולא נענה → התראה לרכזת שלו.
//
// 30.09: מתוך 75 שיחות שלא נענו בספטמבר, 53 היו מתקשרים חדשים — הם
// נכנסים כליד וגובגט כותב להם תוך דקה. 22 היו מועמדים שכבר במערכת,
// לרוב באמצע תהליך (ראיון, הגעה). הם קיבלו רק דגל "דורש תשומת לב",
// ואף אחד לא חזר אליהם באופן מסודר.
//
// למה התראה לרכזת ולא הודעה מגובגט: גובגט לא כותב למועמד שרכזת
// מחזיקה (הקפאת הבעלות אחרי התקלה של 9.9) — מועמד לא מקבל הודעות
// משני מספרים.
//
// הזרימה:
//  1. מייל של מסקיו על שיחה שלא נענתה, ממועמד קיים → נרשם כממתין.
//  2. הרצה (בסוף כל סריקת מיילים) → אחרי 10 דקות, אם לא חזרו אליו
//     בינתיים (שיחה שנענתה / הודעה שיצאה), הרכזת שלו מקבלת וואטסאפ.
//  3. מחוץ לשעות התורנות (א'–ה' 08:00–17:00, לא בחגים) — ממתין לבוקר.
//     סער: "אחרי 17:00 ובשישי גובגט מטפל לבד עד הבוקר".
// ============================================================

const TYPE = "missed_call_alert";
const GRACE_MIN = 10; // לתת לרכזת לחזור בעצמה לפני שמציקים
const MAX_EMAIL_AGE_H = 3; // מייל ישן שנסרק שוב — לא מתריעים עליו
const PENDING_MAX_DAYS = 4; // סוף שבוע ארוך + חג
const WORK_START_H = 8;
const WORK_END_H = 17;

export interface MaskyooCallInfo {
  status: string | null;
  virtualNumber: string | null;
}

/** שעון קיר ישראלי. */
function israelParts(at: Date): { date: string; hour: number; weekday: string } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(at);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    weekday: get("weekday"),
  };
}

/** האם יש עכשיו רכזת בתורנות (א'–ה', 08:00–17:00, לא בחג). */
export function isStaffedHour(at: Date): boolean {
  const { date, hour, weekday } = israelParts(at);
  if (weekday === "Fri" || weekday === "Sat") return false;
  if (hour < WORK_START_H || hour >= WORK_END_H) return false;
  return !isClosedDay(date);
}

/** למי שולחים, לפי מי שמחזיקה בליד. */
export function recipientFor(handledBy: string | null | undefined): AlertRecipient {
  const who = (handledBy ?? "").toLowerCase();
  if (who.startsWith("tami")) return "תמי";
  if (who.startsWith("hoshen")) return "חושן";
  return "recruiters"; // גובגט / כתובת כללית / אף אחד — שתיהן יודעות
}

/**
 * נקרא מסריקת המיילים לכל שיחה של מועמד קיים.
 * שיחה שנענתה סוגרת התראות ממתינות של אותו מתקשר; שיחה שלא נענתה נרשמת.
 */
export async function noteExistingCandidateCall(
  db: SupabaseClient,
  args: { leadId: string; phone: string; call: MaskyooCallInfo; emailId: string; callAt: Date }
): Promise<void> {
  const { leadId, phone, call, emailId, callAt } = args;

  if (call.status === "ANSWER") {
    await db.from("cron_reminders")
      .update({ success: true, error: "answered_later" })
      .eq("reminder_type", TYPE)
      .eq("success", false)
      .eq("lead_id", leadId)
      .lte("created_at", new Date(callAt.getTime() + 60_000).toISOString());
    return;
  }

  if (Date.now() - callAt.getTime() > MAX_EMAIL_AGE_H * 3_600_000) return;

  // occurrence_key לפי מזהה המייל: המייל נסרק שוב כל 2 דקות, ההתראה נרשמת פעם אחת
  await db.from("cron_reminders").insert({
    lead_id: leadId,
    reminder_type: TYPE,
    occurrence_key: `missed-call:${emailId}`,
    payload: { phone, at: callAt.toISOString(), status: call.status, virtual: call.virtualNumber },
    success: false,
  });
}

interface PendingRow {
  id: string;
  lead_id: string;
  payload: { phone?: string; at?: string; status?: string | null } | null;
  created_at: string;
}

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit",
    day: "2-digit", month: "2-digit",
  }).format(new Date(iso));
}

/** שולח את ההתראות שהבשילו. נקרא בסוף כל סריקת מיילים. */
export async function flushMissedCallAlerts(
  db: SupabaseClient,
  now: Date = new Date()
): Promise<{ sent: number; resolved: number; waiting: number }> {
  const result = { sent: 0, resolved: 0, waiting: 0 };

  const { data: rows } = await db.from("cron_reminders")
    .select("id, lead_id, payload, created_at")
    .eq("reminder_type", TYPE)
    .eq("success", false)
    .gte("created_at", new Date(now.getTime() - PENDING_MAX_DAYS * 86_400_000).toISOString())
    .lte("created_at", new Date(now.getTime() - GRACE_MIN * 60_000).toISOString())
    .order("created_at")
    .limit(100);
  const pending = (rows ?? []) as PendingRow[];
  if (pending.length === 0) return result;

  if (!isStaffedHour(now)) {
    result.waiting = pending.length;
    return result;
  }

  // כמה שיחות מאותו מועמד = התראה אחת
  const byLead = new Map<string, PendingRow[]>();
  for (const r of pending) {
    const list = byLead.get(r.lead_id) ?? [];
    list.push(r);
    byLead.set(r.lead_id, list);
  }

  for (const [leadId, calls] of byLead) {
    const firstAt = calls[0].payload?.at ?? calls[0].created_at;
    const ids = calls.map((c) => c.id);

    // חזרו אליו בינתיים? הודעה של רכזת שיצאה אחרי השיחה = טופל.
    const { data: replied } = await db.from("messages")
      .select("id")
      .eq("lead_id", leadId)
      .eq("role", "recruiter")
      .gte("created_at", firstAt)
      .limit(1);
    if (replied && replied.length > 0) {
      await db.from("cron_reminders").update({ success: true, error: "replied" }).in("id", ids);
      result.resolved += ids.length;
      continue;
    }

    const { data: lead } = await db.from("leads")
      .select("name, phone, status, handled_by, do_not_contact")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead || lead.do_not_contact) {
      await db.from("cron_reminders").update({ success: true, error: "no_lead_or_dnc" }).in("id", ids);
      result.resolved += ids.length;
      continue;
    }

    const name = (lead.name as string | null)?.trim() || "מועמד/ת";
    const phone = (lead.phone as string | null) ?? calls[0].payload?.phone ?? "";
    const stage = STATUS_LABELS[lead.status as LeadStatusValue] ?? String(lead.status ?? "");
    const times = calls.map((c) => hhmm(c.payload?.at ?? c.created_at)).join(", ");
    const count = calls.length > 1 ? `${calls.length} פעמים ` : "";

    const err = await alertViaGubget({
      to: recipientFor(lead.handled_by as string | null),
      title: "מועמד/ת התקשר/ה ולא נענה",
      subject: `${name} · ${phone}`,
      reason: `התקשר/ה ${count}(${times}) ואף אחד לא ענה. שלב: ${stage}. כדאי לחזור אליו/ה.`,
      text:
        `📞 ${name} (${phone}) התקשר/ה ${count}ולא נענה\n` +
        `מתי: ${times}\nשלב: ${stage}\n` +
        `כדאי לחזור אליו/ה — הכרטיס מסומן "דורש תשומת לב" במערכת.`,
    });
    if (err) {
      await db.from("cron_reminders").update({ error: err.slice(0, 300) }).in("id", ids);
      continue; // נשאר ממתין, הריצה הבאה תנסה שוב
    }
    await db.from("cron_reminders").update({ success: true, error: null }).in("id", ids);
    result.sent++;
  }
  return result;
}
