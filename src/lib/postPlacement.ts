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
import { getAccountForEmail, sendWhatsAppMessage } from "@/lib/whatsappService";
import { isTemporaryBlock, restPeriodAt } from "@/lib/sendGate";
import { alertViaGubget } from "@/lib/gubgetAlert";
import { LeadStatus } from "@/lib/stateMachine";
import { GUARANTEE_PREFIX, GUARANTEE_FLAG_TTL_DAYS } from "@/lib/attention";

// 60 ו-90: רוב העובדים עוזבים אחרי חודש עד שלושה ("מיצו", מצאו תנאים טובים
// יותר, אילת לא התאימה). הבדיקה ביום 60 מציעה מעבר פנימי לפני שמחליטים לעזוב.
export const CHECKIN_DAYS = [3, 14, 30, 60, 90] as const;

export function checkinOwnerEmail(): string {
  return (process.env.CHECKIN_OWNER_EMAIL ?? "barakserv@eilatjobs.com").trim().toLowerCase();
}

/** השם שגובגט מכיר לאחראית הליווי — אליה הולכות התראות תום האחריות. */
export function checkinOwnerGubgetName(): string {
  return (process.env.CHECKIN_OWNER_GUBGET_NAME ?? "מלי").trim();
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
  if (day === 30) {
    return `היי ${n}! חודש${at} 🎉 כיף לראות אותך מחזיק/ה — הכל מסתדר? אני כאן אם צריך משהו.`;
  }
  if (day === 60) {
    return `היי ${n}, מלי מברק שירותים 😊 כבר חודשיים${at}! איך אתה מרגיש? אם בא לך לגוון — תפקיד אחר, מקום אחר או משמרות אחרות — ספר/י לי, יש לנו הרבה אפשרויות באילת 🙏`;
  }
  return `היי ${n}! שלושה חודשים${at} 🎉 זה הישג אמיתי. הכל טוב? אם יש משהו שיעזור לך להמשיך בכיף, אני כאן.`;
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
  expiredFlagsCleared: number;
}

/**
 * מכבה התראות "תקופת האחריות נגמרת" שהאחריות שלהן כבר עברה. הן מתריעות
 * שבוע לפני הסוף; אחרי זה הן רק רעש שמסתיר דגלים אמיתיים (ראו lib/attention).
 */
async function clearExpiredGuaranteeFlags(db: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - GUARANTEE_FLAG_TTL_DAYS * 86_400_000).toISOString();
  const { data } = await db
    .from("leads")
    .update({ needs_attention: false, needs_attention_at: null, attention_reason: null })
    .eq("needs_attention", true)
    .like("attention_reason", `${GUARANTEE_PREFIX}%`)
    .lt("needs_attention_at", cutoff)
    .select("id");
  return data?.length ?? 0;
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
  const summary: CareSummary = { checkinsSent: 0, guaranteeAlerts: 0, failed: 0, expiredFlagsCleared: 0 };
  summary.expiredFlagsCleared = await clearExpiredGuaranteeFlags(db);
  const today = israelToday();
  const leads = await placedLeads(db);
  if (leads.length === 0) return summary;

  const { defaults, byClient } = await guaranteeDaysMap(db);
  const owner = checkinOwnerEmail();
  // ההודעות חתומות "מלי" — יוצאות אך ורק מהמספר המקושר שלה. עד
  // שמקושר, בדיקות השלומות פשוט לא נשלחות (התראות האחריות ממשיכות
  // כדגלים). ברגע שהמספר מקושר ב"הוואטסאפ שלי" — הכל נדלק לבד.
  const sender = await getAccountForEmail(owner);

  // ── Check-ins בימים CHECKIN_DAYS ───────────────────────────
  const candidates: { lead: PlacedLead; day: number; key: string }[] = [];
  for (const lead of leads) {
    if (!sender) break;
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
    if (!sender) break;
    if (done.has(c.key)) continue;
    const message = checkinMessage(c.day, c.lead.name, c.lead.hired_client);
    const res = await sendWhatsAppMessage(c.lead.phone!, message, sender, { automated: true });
    // נחסם זמנית (לילה, שבת/חג) — לא רושמים: רישום כאן נחשב "כבר נשלח",
    // ובדיקת השלומות לא הייתה יוצאת גם כשהחלון נפתח שוב.
    if (isTemporaryBlock(res.blocked)) continue;
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
    } else {
      summary.failed++;
    }
  }

  // ── התראת תום אחריות (עד שבוע לפני) ─────────────────────────
  // 04.10: ההתראה יצאה מהמספר העסקי שנמחק ב-GreenAPI — 62 נכשלו מאז 15.09,
  // נרשמו כ"טופלו" ולא נשלחו שוב, ו-8 מהן ניסו לצאת בשבת. עכשיו: הודעה אחת
  // מרוכזת ביום דרך גובגט לאחראית הליווי (ואם גובגט לא מגיע אליה — לאדמין),
  // שנחשבת שנשלחה רק כשגובגט אישר. לא בשבת/חג — תצא כשהמנוחה נגמרת.
  if (!restPeriodAt(new Date())) {
    const due = guaranteeDue(leads, defaults, byClient, today);
    if (due.length > 0) {
      const { data: prior } = await db
        .from("cron_reminders")
        .select("occurrence_key, success")
        .in("occurrence_key", due.map((d) => d.key));
      const seen = new Set((prior ?? []).map((r) => String(r.occurrence_key)));
      const sent = new Set((prior ?? []).filter((r) => r.success).map((r) => String(r.occurrence_key)));
      const pending = due.filter((d) => !sent.has(d.key));

      // דגל על הכרטיס — רק בפעם הראשונה, כדי לא להחזיר דגל שרכזת כבר סגרה
      for (const d of pending.filter((d) => !seen.has(d.key))) {
        await db
          .from("leads")
          .update({
            needs_attention: true,
            needs_attention_at: new Date().toISOString(),
            attention_reason: guaranteeReason(d),
          })
          .eq("id", d.lead.id);
      }

      if (pending.length > 0) {
        const res = await sendGuaranteeDigest(pending);
        await db.from("cron_reminders").upsert(
          pending.map((d) => ({
            lead_id: d.lead.id,
            reminder_type: "guarantee_ending",
            occurrence_key: d.key,
            payload: { remaining: d.remaining, ...(res.ok ? { via: res.via } : {}) },
            success: res.ok,
            error: res.ok ? null : res.error.slice(0, 300),
          })),
          { onConflict: "occurrence_key" }
        );
        if (res.ok) summary.guaranteeAlerts += pending.length;
        else summary.failed += pending.length;
      }
    }
  }

  return summary;
}

// ── תום אחריות: מי, ואיך מנסחים ─────────────────────────────

export interface GuaranteeDue {
  lead: { id: string; name: string | null; hired_client: string | null };
  remaining: number;
  key: string;
}

/**
 * עובדים שתקופת האחריות שלהם נגמרת בעוד 1–7 ימים. חלון של שבוע ולא של
 * יומיים: ריצה שנפלה על שבת, או התראה שנכשלה, עדיין נתפסת למחרת.
 */
export function guaranteeDue(
  leads: { id: string; name: string | null; hired_client: string | null; start_date: string | null }[],
  defaults: number,
  byClient: Map<string, number>,
  today: string
): GuaranteeDue[] {
  const out: GuaranteeDue[] = [];
  for (const lead of leads) {
    if (!lead.start_date) continue;
    const days = byClient.get((lead.hired_client ?? "").trim()) ?? defaults;
    if (days <= 0) continue;
    const remaining = days - daysBetween(lead.start_date.slice(0, 10), today);
    if (remaining < 1 || remaining > 7) continue;
    out.push({ lead, remaining, key: `guarantee:${lead.id}` });
  }
  return out.sort((a, b) => a.remaining - b.remaining);
}

function guaranteeLine(d: GuaranteeDue): string {
  return `${d.lead.name ?? "עובד/ת"}${d.lead.hired_client ? ` (${d.lead.hired_client})` : ""} — עוד ${d.remaining} ${d.remaining === 1 ? "יום" : "ימים"}`;
}

function guaranteeReason(d: GuaranteeDue): string {
  return `⏳ תקופת האחריות של ${guaranteeLine(d)}. שווה בדיקת שלומות אחרונה 🙏`;
}

/** ההודעה המרוכזת: פרמטרי התבנית (שורה אחת כל אחד) והטקסט המלא. */
export function guaranteeDigest(items: GuaranteeDue[]): { title: string; subject: string; reason: string; text: string } {
  const lines = items.map(guaranteeLine);
  const one = lines.join(" · ") + " — שווה בדיקת שלומות אחרונה";
  return {
    title: "תקופת אחריות נגמרת",
    subject: items.length === 1 ? lines[0] : `${items.length} עובדים`,
    reason: one.length > 900 ? `${one.slice(0, 899)}…` : one,
    text:
      `⏳ תקופת האחריות נגמרת בקרוב:\n${lines.map((l) => `• ${l}`).join("\n")}\n\n` +
      `שווה בדיקת שלומות אחרונה 🙏 הכרטיסים מסומנים "דורש תשומת לב".`,
  };
}

/** לאחראית הליווי דרך גובגט; אם גובגט לא מגיע אליה — לאדמין, עם ציון למי זה. */
export async function sendGuaranteeDigest(
  items: GuaranteeDue[]
): Promise<{ ok: true; via: string } | { ok: false; error: string }> {
  const msg = guaranteeDigest(items);
  const owner = checkinOwnerGubgetName();
  const toOwner = await alertViaGubget({ ...msg, to: owner });
  if (!toOwner) return { ok: true, via: owner };
  const toAdmin = await alertViaGubget({
    ...msg,
    title: `${msg.title} (ל${owner})`,
    text: `נשלח אליך כי גובגט לא הצליח להגיע ל${owner}.\n\n${msg.text}`,
    to: "admins",
  });
  if (!toAdmin) return { ok: true, via: "admins" };
  return { ok: false, error: `${owner}: ${toOwner} · admins: ${toAdmin}` };
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
