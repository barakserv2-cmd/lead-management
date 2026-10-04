// הריצה של מלווה ההגעה — נקראת מ-cron/daily כל שעה. הלוגיקה (מתי, מה
// לשלוח, איך לזהות היסוס) ב-arrivalCompanion.ts.
//
// שולח ממספר גובגט (officialReminderAccount — הערוץ הרשמי), כמו תזכורות
// הראיון. התשובות מגיעות לגובגט, שמעביר אותן ל-V1 דרך ה-bridge, ושם נבדקים
// סימני ההיסוס. בלי מספר רשמי מוגדר — המספר העסקי, כמו קודם.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  businessAccount,
  officialReminderAccount,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  type SendResult,
} from "@/lib/whatsappService";
import { isTemporaryBlock } from "@/lib/sendGate";
import {
  ARRIVAL_TEMPLATES,
  ARRIVAL_WINDOW_STATUSES,
  arrivalCompanionEnabledFor,
  renderTemplate,
  templateParams,
  type CompanionTouch,
  firstDayMessage,
  planFirstDayTouch,
  planTouch,
  touchMessage,
  whenLabel,
  type TouchType,
} from "@/lib/arrivalCompanion";
import { LeadStatus } from "@/lib/stateMachine";

const SILENT_AFTER_HOURS = 24;

/**
 * שליחת נקודת מגע: טקסט חופשי (המלא) אם המועמד כתב ביממה האחרונה, ואחרת
 * התבנית המאושרת המקבילה. מחזיר גם את הנוסח שיצא בפועל, לשמירה בצ'אט.
 */
async function sendTouch(
  phone: string,
  touch: CompanionTouch,
  text: string,
  lead: { name: string | null; interview_date?: string | null; hired_client?: string | null }
): Promise<SendResult & { sentText: string; via: "text" | "template" }> {
  const official = officialReminderAccount();
  if (!official) {
    const r = await sendWhatsAppMessage(phone, text, businessAccount(), { automated: true });
    return { ...r, sentText: text, via: "text" };
  }
  const free = await sendWhatsAppMessage(phone, text, official, { automated: true });
  if (free.success || !free.windowClosed) return { ...free, sentText: text, via: "text" };

  const tpl = ARRIVAL_TEMPLATES[touch];
  const params = templateParams(touch, lead);
  const r = await sendWhatsAppTemplate(phone, { name: tpl.name, language: "he", params }, official, { automated: true });
  return { ...r, sentText: renderTemplate(tpl.body, params), via: "template" };
}

interface WindowLead {
  id: string;
  name: string | null;
  phone: string | null;
  interview_date: string;
  comes_with_friend: boolean | null;
  do_not_contact: boolean | null;
}

export interface CompanionSummary {
  sent: number;
  failed: number;
  silentFlags: number;
  skippedDisabled: number;
}

function israelNow(): { date: string; hour: number; weekday: number } {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
  const hour =
    Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false }).format(now)
    ) % 24;
  return { date, hour, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}

function dayDiff(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000
  );
}

/**
 * "איך היה היום הראשון?" — יום-יומיים אחרי תחילת העבודה. רוב העזיבות שנרשמו
 * קרו תוך 0–3 ימים (29/09), כלומר לפני בדיקת השלומות של יום 3.
 */
async function runFirstDayTouches(
  db: SupabaseClient,
  now: { date: string; hour: number; weekday: number },
  summary: CompanionSummary
): Promise<void> {
  const from = new Date(`${now.date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 2);
  const { data, error } = await db
    .from("leads")
    .select("id, name, phone, start_date, hired_client, do_not_contact")
    .in("status", [LeadStatus.HIRED, LeadStatus.STARTED])
    .not("phone", "is", null)
    .gte("start_date", from.toISOString().slice(0, 10))
    .lt("start_date", now.date)
    .limit(300);
  if (error || !data) return;

  const leads = (
    data as { id: string; name: string | null; phone: string | null; start_date: string; hired_client: string | null; do_not_contact: boolean | null }[]
  ).filter((l) => !l.do_not_contact && arrivalCompanionEnabledFor(l.phone));
  if (leads.length === 0) return;

  const keys = leads.map((l) => `arrival:first_day:${l.id}:${l.start_date.slice(0, 10)}`);
  const { data: done } = await db.from("cron_reminders").select("occurrence_key").in("occurrence_key", keys);
  const sentKeys = new Set((done ?? []).map((r) => String(r.occurrence_key)));

  for (const lead of leads) {
    const key = `arrival:first_day:${lead.id}:${lead.start_date.slice(0, 10)}`;
    const go = planFirstDayTouch({
      daysSinceStart: dayDiff(lead.start_date.slice(0, 10), now.date),
      hourNow: now.hour,
      weekday: now.weekday,
      sent: sentKeys.has(key),
    });
    if (!go) continue;

    const res = await sendTouch(lead.phone!, "first_day", firstDayMessage(lead), lead);
    if (isTemporaryBlock(res.blocked)) continue;
    await db.from("cron_reminders").insert({
      lead_id: lead.id,
      reminder_type: "arrival_first_day",
      occurrence_key: key,
      payload: { start_date: lead.start_date, via: res.via },
      success: res.success,
      error: res.error ?? null,
    });
    if (res.success) {
      summary.sent++;
      await db.from("messages").insert({ lead_id: lead.id, role: "recruiter", content: res.sentText, sent_by: "מלווה ההגעה" });
      await db.from("lead_events").insert({
        lead_id: lead.id,
        event_type: "ליווי הגעה",
        event_text: "נשלחה הודעת \"איך היה היום הראשון\"",
        created_by: "מלווה ההגעה",
      });
    } else {
      summary.failed++;
    }
  }
}

export async function runArrivalCompanion(db: SupabaseClient): Promise<CompanionSummary> {
  const summary: CompanionSummary = { sent: 0, failed: 0, silentFlags: 0, skippedDisabled: 0 };
  const now = israelNow();
  await runFirstDayTouches(db, now, summary);
  const horizon = new Date(`${now.date}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 8);

  const { data, error } = await db
    .from("leads")
    .select("id, name, phone, interview_date, comes_with_friend, do_not_contact")
    .in("status", ARRIVAL_WINDOW_STATUSES)
    .eq("interview_type", "in_person")
    .not("phone", "is", null)
    .gte("interview_date", `${now.date}T00:00:00Z`)
    .lt("interview_date", horizon.toISOString())
    .limit(500);
  if (error || !data) return summary;

  const leads = (data as WindowLead[]).filter((l) => {
    if (l.do_not_contact) return false;
    if (!arrivalCompanionEnabledFor(l.phone)) {
      summary.skippedDisabled++;
      return false;
    }
    return true;
  });
  if (leads.length === 0) return summary;

  // כל נקודות המגע שכבר נשלחו ללידים האלה, בשאילתה אחת
  const { data: reminders } = await db
    .from("cron_reminders")
    .select("lead_id, occurrence_key, created_at, success")
    .in(
      "lead_id",
      leads.map((l) => l.id)
    )
    .like("occurrence_key", "arrival:%");
  const byLead = new Map<string, { key: string; created_at: string; success: boolean }[]>();
  for (const r of reminders ?? []) {
    const list = byLead.get(String(r.lead_id)) ?? [];
    list.push({ key: String(r.occurrence_key), created_at: String(r.created_at), success: r.success !== false });
    byLead.set(String(r.lead_id), list);
  }

  for (const lead of leads) {
    const interviewDay = lead.interview_date.slice(0, 10);
    const daysAhead = dayDiff(now.date, interviewDay);
    const rows = (byLead.get(lead.id) ?? []).filter((r) => r.key.endsWith(`:${lead.id}:${interviewDay}`));
    const sent = new Set<TouchType>();
    const sentToday = new Set<TouchType>();
    let lastAskAt: string | null = null;
    let silentFlagged = false;
    for (const r of rows) {
      const touch = r.key.split(":")[1];
      if (touch === "silent") {
        silentFlagged = true;
        continue;
      }
      sent.add(touch as TouchType);
      const sentDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(r.created_at));
      if (sentDay === now.date) sentToday.add(touch as TouchType);
      if (r.success && (touch === "confirm" || touch === "travel_check") && (!lastAskAt || r.created_at > lastAskAt)) {
        lastAskAt = r.created_at;
      }
    }

    // ── לא ענה 24 שעות? דגל לרכזת (פעם אחת לכל מועד ראיון)
    if (lastAskAt && !silentFlagged && Date.now() - new Date(lastAskAt).getTime() >= SILENT_AFTER_HOURS * 3600_000) {
      const { count } = await db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead.id)
        .eq("role", "user")
        .gt("created_at", lastAskAt);
      if ((count ?? 0) === 0) {
        const reason = `🚩 מלווה ההגעה: ${lead.name ?? "המועמד/ת"} לא ענה/תה כבר יום להודעת ההגעה (ראיון ${whenLabel(lead.interview_date)}) — כדאי להתקשר`;
        await db
          .from("leads")
          .update({ needs_attention: true, needs_attention_at: new Date().toISOString(), attention_reason: reason })
          .eq("id", lead.id);
        await db.from("cron_reminders").insert({
          lead_id: lead.id,
          reminder_type: "arrival_silent",
          occurrence_key: `arrival:silent:${lead.id}:${interviewDay}`,
          payload: { since: lastAskAt },
          success: true,
        });
        await db.from("lead_events").insert({
          lead_id: lead.id,
          event_type: "ליווי הגעה",
          event_text: reason,
          created_by: "מלווה ההגעה",
        });
        summary.silentFlags++;
      }
    }

    const d = new Date(lead.interview_date);
    const hasTime = !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0);
    const touch = planTouch({
      daysAhead,
      interviewHour: hasTime ? d.getUTCHours() : null,
      hourNow: now.hour,
      sent,
      sentToday,
      weekday: now.weekday,
    });
    if (!touch) continue;

    const res = await sendTouch(lead.phone!, touch, touchMessage(touch, lead, daysAhead), lead);
    // נחסם זמנית (לילה, שבת/חג) — לא רושמים, כדי שהריצה הבאה תנסה שוב
    if (isTemporaryBlock(res.blocked)) continue;

    await db.from("cron_reminders").insert({
      lead_id: lead.id,
      reminder_type: `arrival_${touch}`,
      occurrence_key: `arrival:${touch}:${lead.id}:${interviewDay}`,
      payload: { interview_at: lead.interview_date, days_ahead: daysAhead, via: res.via },
      success: res.success,
      error: res.error ?? null,
    });
    if (res.success) {
      summary.sent++;
      await db.from("messages").insert({ lead_id: lead.id, role: "recruiter", content: res.sentText, sent_by: "מלווה ההגעה" });
      await db.from("lead_events").insert({
        lead_id: lead.id,
        event_type: "ליווי הגעה",
        event_text:
          touch === "confirm" ? "נשלח אישור הגעה" : touch === "travel_check" ? "נשלחה בדיקת נסיעה" : "נשלחה הודעת בוקר הראיון",
        created_by: "מלווה ההגעה",
      });
    } else {
      summary.failed++;
    }
  }

  return summary;
}
