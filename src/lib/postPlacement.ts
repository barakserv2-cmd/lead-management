// ============================================================
// Post-placement care — ליווי אחרי השמה ותקופת אחריות (שלב 6)
// ============================================================
//
// הבעלים: מלי (CHECKIN_OWNER_EMAIL). ההודעות לעובדים יוצאות מהמספר
// המקושר שלה (resolveSender) — עד שיקושר, מהמספר העסקי. תשובה
// בעייתית של עובד מזוהה ב-NLU הקיים של ה-webhook ומרימה דגל.
//
// אידמפוטנטיות: cron_reminders.occurrence_key —
//   checkin:{lead}:{day} · guarantee:{lead}

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSender, sendWhatsAppMessage, businessAccount } from "@/lib/whatsappService";
import { LeadStatus } from "@/lib/stateMachine";

export const CHECKIN_DAYS = [3, 14, 30] as const;

export function checkinOwnerEmail(): string {
  return (process.env.CHECKIN_OWNER_EMAIL ?? "barakserv@eilatjobs.com").trim().toLowerCase();
}

function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] || "היי";
}

function checkinMessage(day: number, name: string | null, client: string | null): string {
  const n = firstName(name);
  const at = client ? ` ב${client}` : "";
  if (day === 3) {
    return `היי ${n} 😊 כאן מלי מברק שירותים. איך הימים הראשונים${at}? הכל בסדר עם המשמרות והמגורים? אפשר לכתוב לי כאן על כל דבר 🙏`;
  }
  if (day === 14) {
    return `היי ${n}, מלי מברק שירותים 🙂 כבר שבועיים${at} — איך אתה מרגיש? יש משהו שהיית רוצה שנשפר?`;
  }
  return `היי ${n}! חודש${at} 🎉 כיף לראות אותך מחזיק/ה — הכל מסתדר? אני כאן אם צריך משהו.`;
}

/** תאריך היום לפי לוח ישראל (YYYY-MM-DD). */
function israelToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

/** הפרש ימים שלמים בין שני תאריכי-לוח. */
function daysBetween(fromDate: string, toDate: string): number {
  return Math.round(
    (new Date(`${toDate}T00:00:00Z`).getTime() - new Date(`${fromDate}T00:00:00Z`).getTime()) /
      86_400_000
  );
}

interface PlacedLead {
  id: string;
  name: string | null;
  phone: string | null;
  start_date: string | null;
  hired_client: string | null;
  do_not_contact: boolean;
}

async function placedLeads(db: SupabaseClient): Promise<PlacedLead[]> {
  const { data } = await db
    .from("leads")
    .select("id, name, phone, start_date, hired_client, do_not_contact")
    .in("status", [LeadStatus.HIRED, LeadStatus.STARTED])
    .not("start_date", "is", null)
    .limit(2000);
  return (data ?? []) as PlacedLead[];
}

async function existingKeys(db: SupabaseClient, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const { data } = await db
    .from("cron_reminders")
    .select("occurrence_key")
    .in("occurrence_key", keys);
  return new Set((data ?? []).map((r) => String(r.occurrence_key)));
}

export interface CareSummary {
  checkinsSent: number;
  guaranteeAlerts: number;
  failed: number;
}

/** ימי אחריות אפקטיביים פר-מלון: דריסה בטבלת clients או ברירת המחדל. */
async function guaranteeDaysMap(
  db: SupabaseClient
): Promise<{ defaults: number; byClient: Map<string, number> }> {
  const [{ data: settings }, { data: clients }] = await Promise.all([
    db.from("finance_settings").select("default_guarantee_days").eq("id", 1).maybeSingle(),
    db.from("clients").select("name, guarantee_days").not("guarantee_days", "is", null),
  ]);
  const byClient = new Map<string, number>();
  for (const c of clients ?? []) {
    byClient.set(String(c.name), Number(c.guarantee_days));
  }
  return { defaults: Number(settings?.default_guarantee_days ?? 30), byClient };
}

export async function runPostPlacementCare(db: SupabaseClient): Promise<CareSummary> {
  const summary: CareSummary = { checkinsSent: 0, guaranteeAlerts: 0, failed: 0 };
  const today = israelToday();
  const leads = await placedLeads(db);
  if (leads.length === 0) return summary;

  const { defaults, byClient } = await guaranteeDaysMap(db);
  const owner = checkinOwnerEmail();
  const sender = (await resolveSender(owner)) ?? businessAccount();

  // ── Check-ins בימים 3/14/30 ────────────────────────────────
  const candidates: { lead: PlacedLead; day: number; key: string }[] = [];
  for (const lead of leads) {
    if (!lead.phone || lead.do_not_contact || !lead.start_date) continue;
    const since = daysBetween(lead.start_date.slice(0, 10), today);
    for (const day of CHECKIN_DAYS) {
      // חלון של יומיים — אם הקרון פספס את היום המדויק, עדיין נשלח
      if (since >= day && since <= day + 1) {
        candidates.push({ lead, day, key: `checkin:${lead.id}:${day}` });
      }
    }
  }

  const done = await existingKeys(db, candidates.map((c) => c.key));
  for (const c of candidates) {
    if (done.has(c.key)) continue;
    const message = checkinMessage(c.day, c.lead.name, c.lead.hired_client);
    const res = await sendWhatsAppMessage(c.lead.phone!, message, sender, { automated: true });
    await db.from("cron_reminders").insert({
      lead_id: c.lead.id,
      reminder_type: `checkin_day${c.day}`,
      occurrence_key: c.key,
      payload: { day: c.day },
      success: res.success,
      error: res.error ?? null,
    });
    if (res.success) {
      summary.checkinsSent++;
      await db.from("messages").insert({
        lead_id: c.lead.id,
        role: "recruiter",
        content: message,
        sent_by: owner,
        via_instance: sender.instanceId,
      });
      await db.from("lead_events").insert({
        lead_id: c.lead.id,
        event_type: "ליווי",
        event_text: `נשלחה בדיקת שלומות יום ${c.day} להעסקה`,
        created_by: owner,
      });
    } else if (res.blocked !== "quiet_hours") {
      summary.failed++;
    }
  }

  // ── התראת תום אחריות (שבוע לפני) ───────────────────────────
  const ownerPhone = await db
    .from("whatsapp_accounts")
    .select("phone")
    .eq("user_email", owner)
    .eq("is_active", true)
    .maybeSingle();

  for (const lead of leads) {
    if (!lead.start_date) continue;
    const days = byClient.get((lead.hired_client ?? "").trim()) ?? defaults;
    if (days <= 0) continue;
    const since = daysBetween(lead.start_date.slice(0, 10), today);
    const remaining = days - since;
    if (remaining > 7 || remaining < 6) continue; // חלון יומיים סביב "שבוע לפני"

    const key = `guarantee:${lead.id}`;
    const exists = await existingKeys(db, [key]);
    if (exists.has(key)) continue;

    const alert =
      `⏳ תקופת האחריות של ${lead.name ?? "עובד/ת"}` +
      (lead.hired_client ? ` ב${lead.hired_client}` : "") +
      ` נגמרת בעוד ${remaining} ימים. שווה בדיקת שלומות אחרונה 🙏`;

    let ok = true;
    if (ownerPhone.data?.phone) {
      const res = await sendWhatsAppMessage(String(ownerPhone.data.phone), alert, businessAccount(), {
        skipGate: true,
      });
      ok = res.success;
    }
    await db
      .from("leads")
      .update({
        needs_attention: true,
        needs_attention_at: new Date().toISOString(),
        attention_reason: alert,
      })
      .eq("id", lead.id);
    await db.from("cron_reminders").insert({
      lead_id: lead.id,
      reminder_type: "guarantee_ending",
      occurrence_key: key,
      payload: { remaining },
      success: ok,
    });
    summary.guaranteeAlerts++;
  }

  return summary;
}

// ── דוח "אחריות פעילה" ──────────────────────────────────────

export interface GuaranteeRow {
  lead_id: string;
  name: string | null;
  client: string | null;
  position: string | null;
  start_date: string;
  guarantee_days: number;
  days_left: number;
  last_checkin: string | null; // "יום 3" וכו'
  flagged: boolean;
}

export async function computeGuaranteeReport(db: SupabaseClient): Promise<GuaranteeRow[]> {
  const today = israelToday();
  const { defaults, byClient } = await guaranteeDaysMap(db);
  const { data: leads } = await db
    .from("leads")
    .select("id, name, hired_client, hired_position, job_title, start_date, needs_attention")
    .in("status", [LeadStatus.HIRED, LeadStatus.STARTED])
    .not("start_date", "is", null)
    .limit(2000);

  const ids = (leads ?? []).map((l) => l.id as string);
  const checkins = new Map<string, number>();
  if (ids.length > 0) {
    const { data: rem } = await db
      .from("cron_reminders")
      .select("lead_id, reminder_type")
      .in("lead_id", ids)
      .like("reminder_type", "checkin_day%")
      .eq("success", true);
    for (const r of rem ?? []) {
      const day = Number(String(r.reminder_type).replace("checkin_day", ""));
      const cur = checkins.get(String(r.lead_id)) ?? 0;
      if (day > cur) checkins.set(String(r.lead_id), day);
    }
  }

  const rows: GuaranteeRow[] = [];
  for (const l of leads ?? []) {
    const start = String(l.start_date).slice(0, 10);
    const days = byClient.get((String(l.hired_client ?? "")).trim()) ?? defaults;
    const left = days - daysBetween(start, today);
    if (left < -30) continue; // מזמן מובטח — לא מעניין בדוח
    rows.push({
      lead_id: String(l.id),
      name: (l.name as string) ?? null,
      client: (l.hired_client as string) ?? null,
      position: ((l.hired_position as string) ?? (l.job_title as string)) || null,
      start_date: start,
      guarantee_days: days,
      days_left: left,
      last_checkin: checkins.has(String(l.id)) ? `יום ${checkins.get(String(l.id))}` : null,
      flagged: Boolean(l.needs_attention),
    });
  }
  return rows.sort((a, b) => a.days_left - b.days_left);
}
