// ============================================================
// Rules Engine — מנוע החוקים (שלב 3)
// ============================================================
//
// רץ מ-cron/scheduled כל 5 דקות. מממש את "ספר מנוע החוקים":
//   - חוק = מתי (טריגר) / על מי (תנאים) / מה עושים (פעולה)
//   - המנוע רק מדבר ומסמן — לעולם לא משנה סטטוס, לא מוחק, לא ממזג
//   - חוקי הברזל נאכפים כאן בקוד:
//       * אין פעולות בין 22:00–08:00 (וגם שער השליחה חוסם)
//       * opt-out נחסם בשער השליחה
//       * פעם אחת ביום פר חוק+ליד (occurrence_key ייחודי)
//       * לכל היותר הודעת מועמד אחת ביום פר ליד, מכל החוקים יחד
//       * כל פעולה נרשמת ביומן הליד (lead_events) וב-automation_runs

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSender, businessAccount, sendWhatsAppMessage } from "@/lib/whatsappService";
import { isQuietHoursNow } from "@/lib/sendGate";
import { israelNow } from "@/lib/booking";
import { LeadStatus } from "@/lib/stateMachine";

interface Rule {
  id: string;
  name: string;
  trigger_type: "status_age" | "flag_open" | "after_interview";
  params: Record<string, unknown>;
  action_type: "message_candidate" | "raise_flag" | "notify_recruiter" | "notify_admin";
  template: string | null;
}

interface TargetLead {
  id: string;
  name: string | null;
  phone: string | null;
  handled_by: string | null;
  /** שעה להצגה בתבנית ({{שעה}}) — מתי הדגל הורם / מתי היה הראיון */
  refTime?: string;
}

export interface EngineSummary {
  rules: number;
  matched: number;
  executed: number;
  skipped: number;
  errors: number;
}

const hoursAgoIso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] || "היי";
}

function fmtHour(iso: string | null | undefined, utcFields = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = utcFields ? d.getUTCHours() : d.getHours();
  const mm = utcFields ? d.getUTCMinutes() : d.getMinutes();
  // זמני-אמת מומרים לשעון ישראל להצגה; interview_date הוא כבר שעון-קיר
  if (!utcFields) {
    return new Date(iso).toLocaleTimeString("he-IL", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function fillTemplate(
  template: string,
  lead: TargetLead,
  extra: { recruiter?: string | null } = {}
): string {
  return template
    .replaceAll("{{שם}}", firstName(lead.name))
    .replaceAll("{{שעה}}", lead.refTime ?? "")
    .replaceAll("{{רכזת}}", (extra.recruiter ?? "").split("@")[0] || "—");
}

// ── מציאת הלידים שהחוק חל עליהם ("מתי" + "על מי") ────────────

async function findTargets(db: SupabaseClient, rule: Rule): Promise<TargetLead[]> {
  const p = rule.params;

  if (rule.trigger_type === "status_age") {
    // ליד תקוע בסטטוס X בין hours ל-max_hours, בלי מגע יוצא, עם טלפון.
    // max_hours הוא ההגנה מהצפה: הערימה הישנה לא נוגעים בה אוטומטית.
    const hours = Number(p.hours ?? 3);
    const maxHours = Number(p.max_hours ?? 72);
    const status = String(p.status ?? LeadStatus.NEW_LEAD);
    const { data } = await db
      .from("leads")
      .select("id, name, phone, handled_by, created_at")
      .eq("status", status)
      .eq("do_not_contact", false)
      .not("phone", "is", null)
      .is("last_contact_at", null)
      .lte("created_at", hoursAgoIso(hours))
      .gte("created_at", hoursAgoIso(maxHours))
      .limit(100);
    return (data ?? []).map((l) => ({ ...l, refTime: fmtHour(l.created_at as string) }));
  }

  if (rule.trigger_type === "flag_open") {
    const hours = Number(p.hours ?? 2);
    const { data } = await db
      .from("leads")
      .select("id, name, phone, handled_by, human_attention_raised_at")
      .eq("needs_human_attention", true)
      .lte("human_attention_raised_at", hoursAgoIso(hours))
      .gte("human_attention_raised_at", hoursAgoIso(72))
      .limit(100);
    return (data ?? []).map((l) => ({
      ...l,
      refTime: fmtHour(l.human_attention_raised_at as string),
    }));
  }

  if (rule.trigger_type === "after_interview") {
    // interview_date הוא שעון-קיר ישראלי עם תווית UTC — משווים מול
    // "עכשיו בישראל" באותה קונבנציה בדיוק.
    const hours = Number(p.hours ?? 24);
    const now = israelNow();
    const wallNowMs = new Date(
      `${now.dateStr}T${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:${String(now.minutes % 60).padStart(2, "0")}:00Z`
    ).getTime();
    const cutoff = new Date(wallNowMs - hours * 3600_000).toISOString();
    const floor = new Date(wallNowMs - 7 * 24 * 3600_000).toISOString();
    const { data } = await db
      .from("leads")
      .select("id, name, phone, handled_by, interview_date")
      .eq("status", LeadStatus.INTERVIEW_BOOKED)
      .not("interview_date", "is", null)
      .lte("interview_date", cutoff)
      .gte("interview_date", floor)
      .limit(100);
    return (data ?? []).map((l) => ({
      ...l,
      refTime: fmtHour(l.interview_date as string, true),
    }));
  }

  return [];
}

// ── ביצוע הפעולה ("מה עושים") ────────────────────────────────

async function recruiterPhone(db: SupabaseClient, email: string | null): Promise<string | null> {
  if (!email) return null;
  const { data } = await db
    .from("whatsapp_accounts")
    .select("phone")
    .eq("user_email", email.toLowerCase())
    .eq("is_active", true)
    .maybeSingle();
  return (data?.phone as string) ?? null;
}

async function executeAction(
  db: SupabaseClient,
  rule: Rule,
  lead: TargetLead
): Promise<{ ok: boolean; detail: string }> {
  const template = rule.template ?? "";

  if (rule.action_type === "message_candidate") {
    if (!lead.phone) return { ok: false, detail: "אין טלפון" };
    const message = fillTemplate(template, lead);
    const sender = (await resolveSender(lead.handled_by)) ?? businessAccount();
    const res = await sendWhatsAppMessage(lead.phone, message, sender, { automated: true });
    if (!res.success) return { ok: false, detail: res.error ?? "שליחה נכשלה" };
    await db.from("messages").insert({
      lead_id: lead.id,
      role: "recruiter",
      content: message,
      sent_by: "מערכת",
      via_instance: sender.instanceId,
    });
    return { ok: true, detail: "נשלחה הודעה למועמד/ת" };
  }

  if (rule.action_type === "raise_flag") {
    await db
      .from("leads")
      .update({
        needs_attention: true,
        needs_attention_at: new Date().toISOString(),
        attention_reason: fillTemplate(template || rule.name, lead),
      })
      .eq("id", lead.id);
    return { ok: true, detail: "הורם דגל" };
  }

  if (rule.action_type === "notify_recruiter" || rule.action_type === "notify_admin") {
    const target =
      rule.action_type === "notify_admin"
        ? (process.env.ADMIN_ALERT_PHONE ?? "0547000992").trim()
        : await recruiterPhone(db, lead.handled_by);
    if (!target) {
      // אין לרכזת מספר מקושר — לפחות מרימים דגל שלא ילך לאיבוד
      await db
        .from("leads")
        .update({
          needs_attention: true,
          needs_attention_at: new Date().toISOString(),
          attention_reason: fillTemplate(template || rule.name, lead, { recruiter: lead.handled_by }),
        })
        .eq("id", lead.id);
      return { ok: true, detail: "אין מספר לרכזת — הורם דגל במקום" };
    }
    const message = fillTemplate(template, lead, { recruiter: lead.handled_by });
    // הודעה פנימית לצוות — לא כפופה לשער המועמדים
    const res = await sendWhatsAppMessage(target, message, businessAccount(), { skipGate: true });
    if (!res.success) return { ok: false, detail: res.error ?? "שליחה נכשלה" };
    return { ok: true, detail: rule.action_type === "notify_admin" ? "התראה לאדמין" : "תזכורת לרכזת" };
  }

  return { ok: false, detail: "פעולה לא מוכרת" };
}

// ── הריצה הראשית ─────────────────────────────────────────────

export async function runAutomationRules(db: SupabaseClient): Promise<EngineSummary> {
  const summary: EngineSummary = { rules: 0, matched: 0, executed: 0, skipped: 0, errors: 0 };

  // חוק ברזל: המנוע פועל רק בשעות העבודה (דגלים שקטים היו מותרים,
  // אבל אף חוק נוכחי לא צריך אותם בלילה — פשוט מחכים לבוקר).
  if (isQuietHoursNow()) return summary;

  const { data: rules } = await db
    .from("automation_rules")
    .select("id, name, trigger_type, params, action_type, template")
    .eq("enabled", true)
    .order("sort_order");
  if (!rules || rules.length === 0) return summary;
  summary.rules = rules.length;

  const todayKey = israelNow().dateStr;

  for (const rule of rules as Rule[]) {
    let targets: TargetLead[] = [];
    try {
      targets = await findTargets(db, rule);
    } catch (e) {
      console.error(`[rulesEngine] findTargets failed for ${rule.name}:`, e);
      summary.errors++;
      continue;
    }
    summary.matched += targets.length;

    for (const lead of targets) {
      // חוק ברזל: פעם אחת ביום פר חוק+ליד. ה-INSERT עם המפתח הייחודי
      // הוא גם המנעול — ריצה מקבילה תיפול על duplicate ותדלג.
      const occurrenceKey = `${rule.id}:${lead.id}:${todayKey}`;
      const { error: claimErr } = await db.from("automation_runs").insert({
        rule_id: rule.id,
        lead_id: lead.id,
        occurrence_key: occurrenceKey,
        action_type: rule.action_type,
        success: false,
        detail: "in-progress",
      });
      if (claimErr) {
        summary.skipped++;
        continue;
      }

      // חוק ברזל: הודעת מועמד אחת ביום פר ליד, מכל החוקים יחד
      if (rule.action_type === "message_candidate") {
        const { count } = await db
          .from("automation_runs")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id)
          .eq("action_type", "message_candidate")
          .eq("success", true)
          .gte("created_at", new Date(`${todayKey}T00:00:00+03:00`).toISOString());
        if ((count ?? 0) > 0) {
          await db
            .from("automation_runs")
            .update({ detail: "דילוג — כבר נשלחה הודעה אוטומטית היום" })
            .eq("occurrence_key", occurrenceKey);
          summary.skipped++;
          continue;
        }
      }

      let result: { ok: boolean; detail: string };
      try {
        result = await executeAction(db, rule, lead);
      } catch (e) {
        result = { ok: false, detail: e instanceof Error ? e.message : "שגיאה" };
      }

      await db
        .from("automation_runs")
        .update({ success: result.ok, detail: result.detail })
        .eq("occurrence_key", occurrenceKey);

      // שקיפות: כל פעולה נרשמת ביומן הליד, גלוי לרכזות
      await db.from("lead_events").insert({
        lead_id: lead.id,
        event_type: "אוטומציה",
        event_text: `${result.ok ? result.detail : `נכשל: ${result.detail}`} (חוק: ${rule.name})`,
        created_by: "מנוע החוקים",
      });

      if (result.ok) summary.executed++;
      else summary.errors++;
    }
  }

  return summary;
}
