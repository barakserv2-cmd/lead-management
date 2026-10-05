import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/phone";
import { isValidStatus, STATUS_LABELS, type LeadStatusValue } from "@/lib/stateMachine";
import { changeLeadStatus } from "@/lib/actions/changeLeadStatus";
import { appendBridgeMessages, noteOnce, sameSlot, slotLabel, type InboundMessage } from "@/lib/bridgeInbound";
import { applyArrivalSignals, arrivalCompanionEnabledFor } from "@/lib/arrivalCompanion";
import { GUBGET_SOURCE } from "@/lib/constants";
import { closureFor } from "@/lib/israelHolidays";
import { ensureClosuresLoaded } from "@/lib/closures";
import { hasMachineKey } from "@/lib/secrets";
import { applyDeliveryStatus } from "@/lib/deliveryStatus";
import type { SupabaseClient } from "@supabase/supabase-js";
import { completeLeadReminders } from "@/lib/reminders";
import { channelFromAnswer, isUnknownChannel } from "@/lib/leadChannel";

/**
 * POST /api/bridge/from-machine — the autonomous machine ("גובגט") reports
 * what it did, exactly like a recruiter updating the CRM. One-way IN to v1:
 * upsert the lead, append conversation messages, and move the status —
 * attributed to גובגט (handled_by = gubget@eilatjobs.com).
 *
 * Auth: shared secret in x-machine-key (MACHINE_BRIDGE_KEY). This is the
 * reverse of the v1→machine bridge; v1 stays in control of its own writes.
 */

const GUBGET_EMAIL = "gubget@eilatjobs.com";

/** שמות שהם בעצם "אין שם": ריק, מציין מקום, או מספר טלפון בתור שם. */
const PLACEHOLDER_NAMES = new Set([
  "לא ידוע", "לא ידועה", "ללא שם", "ללא שם ללא שם", "אנונימי", "מועמד", "מועמדת",
  "unknown", "candidate", "test", "בדיקה",
]);

export function isPlaceholderName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return true;
  if (PLACEHOLDER_NAMES.has(n.toLowerCase())) return true;
  return /^[\d\s+\-()]+$/.test(n);
}

/**
 * הרכזות שמקבלות מועמדים שגובגט העביר לאדם. רשימה בסביבה (מופרדת בפסיקים)
 * כדי שאפשר יהיה להוסיף או להוריד רכזת בלי שינוי קוד.
 */
const ESCALATION_RECRUITERS = (process.env.ESCALATION_RECRUITERS ?? "tami@eilatjobs.com,hoshen@eilatjobs.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/**
 * מי מקבלת את המועמד הבא: זו שיש לה הכי מעט ממתינים פתוחים כרגע. כך החלוקה
 * מתאזנת מעצמה גם כשרכזת אחת סוגרת מהר יותר או נעדרת יום.
 */
async function pickEscalationOwner(db: SupabaseClient): Promise<string | null> {
  if (ESCALATION_RECRUITERS.length === 0) return null;
  const { data } = await db
    .from("leads")
    .select("handled_by")
    .eq("needs_human_attention", true)
    .in("handled_by", ESCALATION_RECRUITERS);
  const load = new Map(ESCALATION_RECRUITERS.map((e) => [e, 0]));
  for (const row of data ?? []) {
    const e = (row.handled_by as string | null)?.trim().toLowerCase();
    if (e && load.has(e)) load.set(e, (load.get(e) ?? 0) + 1);
  }
  return [...load.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

type InMsg = { role?: string; content?: string; created_at?: string; provider_msg_id?: string };
type InStatus = { provider_msg_id?: string; status?: string; error?: string | null };
type Body = {
  phone?: string;
  name?: string;
  source?: string;
  status?: string; // a v1 LeadStatus code
  messages?: InMsg[];
  escalation?: { reason?: string } | null; // raise the human-attention flag
  note?: string; // a distilled recruiter-style note → lead_events
  // interview booked through גובגט — naive Israel wall-clock "YYYY-MM-DDTHH:mm"
  // (no Z), the same convention v1's own self-booking writes. Without this the
  // lead never lands on the ראיונות board and is lost.
  interviewAt?: string;
  interviewType?: "phone" | "in_person" | "video";
  // 0-100 overall screening score from גובגט's verdict — required by the
  // state machine for an automated move to FIT_FOR_INTERVIEW.
  screeningScore?: number;
  // עדכוני מסירה (נמסרה / נקראה / נכשלה) להודעות שגובגט שלח
  statuses?: InStatus[];
  // התשובה החופשית ל"איך שמעת עלינו?" (סער, 30.09)
  heardFrom?: string;
};

// accept exactly the naive wall-clock shape v1 stores (YYYY-MM-DDTHH:mm[:ss])
const INTERVIEW_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export async function POST(req: NextRequest) {
  if (!hasMachineKey(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });

  const db = getSupabaseAdmin();

  // 0. עדכוני מסירה — לפני כל נגיעה בליד. השלב הבא יוצר ליד לכל מספר לא
  //    מוכר, ועדכון "נמסרה" לבדו לא אמור ליצור ליד. בקשה שיש בה רק עדכונים
  //    מסתיימת כאן. בלי סימון ליד: על כישלון גובגט שולח אסקלציה משלו.
  let statusesApplied = 0;
  for (const st of body.statuses ?? []) {
    const s = st.status;
    if (!st.provider_msg_id || !(s === "sent" || s === "delivered" || s === "read" || s === "failed")) continue;
    const r = await applyDeliveryStatus(db, st.provider_msg_id, s, st.error ?? null, { flagLead: false });
    statusesApplied += r.updated;
  }
  const onlyStatuses =
    (body.statuses?.length ?? 0) > 0 &&
    !body.messages?.length && !body.status && !body.escalation && !body.note && !body.interviewAt && !body.name && !body.heardFrom;
  if (onlyStatuses) {
    return NextResponse.json({ ok: true, statusesApplied });
  }

  // 1. Upsert the lead by phone
  const { data: existing } = await db
    .from("leads")
    .select("id, name, status, handled_by, interview_date, bot_paused")
    .eq("phone", phone)
    .maybeSingle();

  let leadId: string;
  let currentStatus: string | null = null;

  if (existing) {
    leadId = existing.id;
    currentStatus = existing.status;
    const patch: Record<string, unknown> = {};
    // "לא ידוע" הוא מציין מקום, לא שם. כשגובגט מצליח לקבל שם אמיתי בשיחה
    // הוא מחליף את המציין, אבל לעולם לא שם אמיתי שכבר קיים (29.09).
    if (body.name && isPlaceholderName(existing.name) && !isPlaceholderName(body.name)) {
      patch.name = body.name;
    }
    // claim as גובגט only when no human already owns it
    if (!existing.handled_by) patch.handled_by = GUBGET_EMAIL;
    if (Object.keys(patch).length > 0) {
      await db.from("leads").update(patch).eq("id", leadId);
    }
  } else {
    const { data: created, error } = await db
      .from("leads")
      .insert({
        name: body.name ?? "",
        phone,
        source: body.source ?? GUBGET_SOURCE,
        status: "NEW_LEAD",
        handled_by: GUBGET_EMAIL,
      })
      .select("id, status")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: "create_failed", detail: error?.message }, { status: 500 });
    }
    leadId = created.id;
    currentStatus = created.status;
  }

  // 2. Append conversation messages. גובגט may send the same request again
  //    (a retry); a candidate may also really answer "כן" twice. Matching on
  //    text alone dropped every repeated answer — see findBridgeDuplicate.
  const inbound: InboundMessage[] = [];
  for (const m of body.messages ?? []) {
    const content = (m.content ?? "").trim();
    if (!content) continue;
    inbound.push({
      role: m.role === "user" ? "user" : "assistant",
      content,
      providerMsgId: typeof m.provider_msg_id === "string" && m.provider_msg_id.trim() ? m.provider_msg_id.trim() : null,
      createdAt: m.created_at && !isNaN(Date.parse(m.created_at)) ? new Date(m.created_at).toISOString() : null,
    });
  }
  const freshMessages: InboundMessage[] = [];
  const appended = await appendBridgeMessages(db, leadId, inbound, undefined, freshMessages);

  // 3. Move status — through the state machine, as actor "machine". That
  //    scope is what keeps the interview-reconciliation cron (which re-pushes
  //    INTERVIEW_BOOKED for every booked slot) from dragging an ARRIVED/HIRED
  //    candidate backwards, and keeps גובגט from reopening a human's closure.
  let statusChanged = false;
  let statusBlocked: string | null = null;
  // המשרד סגור בחג. גובגט כבר לא מציע מועד כזה, אבל השער נמצא גם כאן: רשימת
  // החלונות שלו יכולה להיות ישנה, והוא רץ בפריסה נפרדת. תאריך חג נדחה בשקט —
  // הליד עצמו נשמר, רק בלי מועד ראיון.
  if (body.interviewAt) await ensureClosuresLoaded();
  const interviewClosure = body.interviewAt ? closureFor(body.interviewAt.slice(0, 10)) : null;
  const validInterviewAt = !!(
    body.interviewAt &&
    INTERVIEW_AT_RE.test(body.interviewAt) &&
    !interviewClosure?.closed
  );
  const screeningScore =
    typeof body.screeningScore === "number" && body.screeningScore >= 0 && body.screeningScore <= 100
      ? Math.round(body.screeningScore)
      : null;
  // דרך changeLeadStatus, כמו כל שינוי סטטוס אחר: היסטוריה ויומן ביקורת,
  // איפוס תת-סטטוס, ובעיקר — ליד שרכזת הקפיאה (bot_paused) לא זז. עד 30.09
  // הגשר כתב את הסטטוס בעצמו, והסנכרון של גובגט (כל 10 דקות) החזיר ל"נקבע
  // ראיון" 37 ראיונות שרכזות ביטלו בחודש האחרון.
  let statusBlockedReason: string | null = null;
  if (body.status && isValidStatus(body.status) && body.status !== currentStatus) {
    const target = body.status as LeadStatusValue;
    const res = await changeLeadStatus({
      leadId,
      newStatus: target,
      userId: GUBGET_EMAIL,
      notes: `עדכון אוטומטי מגובגט (${STATUS_LABELS[target] ?? target})`,
      extra: {
        ...(screeningScore != null ? { screeningScore } : {}),
        ...(validInterviewAt && body.interviewAt
          ? { interviewDate: body.interviewAt, ...(body.interviewType ? { interviewType: body.interviewType } : {}) }
          : {}),
      },
    });
    if (res.success) {
      statusChanged = true;
    } else {
      statusBlocked = res.error ?? "blocked";
      statusBlockedReason = res.reason ?? null;
    }
  }

  // 3b. Interview date — write it whenever גובגט booked a slot, so the lead
  //     appears on the ראיונות board (which requires interview_date IS NOT
  //     NULL). Stored naive, exactly as v1's own self-booking does.
  //     Never onto a lead a human closed or took over: the reconciliation cron
  //     re-pushes every booked slot, and it must not resurrect an interview
  //     for a rejected/paused candidate.
  const CLOSED = new Set([
    "REJECTED", "NOT_SUITABLE", "LOST_CONTACT", "NOT_ACCEPTED",
    "INVALID_PHONE", "EMPLOYMENT_ENDED", "NEVER_STARTED", "NO_SHOW", "CANCELLED_ARRIVAL",
  ]);
  const statusNow = statusChanged ? (body.status as string) : (currentStatus ?? "");

  // מלווה ההגעה: המועמד ענה למספר גובגט (גובגט מעביר כל הודעה נכנסת לכאן).
  // רק הודעות שנשמרו עכשיו — שליחה חוזרת של אותו payload לא מרימה דגל שוב.
  const freshUserText = freshMessages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  if (freshUserText && arrivalCompanionEnabledFor(phone)) {
    await applyArrivalSignals(
      db,
      { id: leadId, name: (existing?.name as string | null) ?? body.name ?? null, status: statusNow },
      freshUserText
    ).catch((err) => console.error(`[bridge] arrival signals failed for lead ${leadId}:`, err));
  }
  const leadLocked = CLOSED.has(statusNow) || !!existing?.bot_paused;
  let interviewSet = false;
  // ליד מוקפא ומועד שונה ממה ששמור: לא מעדכנים, אבל גם לא מעלימים. רשומה
  // אחת ביומן לכל מועד (הסנכרון שולח אותו שוב כל 10 דקות).
  if (validInterviewAt && body.interviewAt && existing?.bot_paused && !sameSlot(existing.interview_date, body.interviewAt)) {
    await noteOnce(
      db,
      leadId,
      GUBGET_EMAIL,
      `גובגט דיווח על ראיון ב-${slotLabel(body.interviewAt)}. הליד בטיפול רכזת, ולכן הכרטיס לא עודכן — לבדוק מול המועמד/ת אם צריך.`
    );
  }
  if (validInterviewAt && body.interviewAt && !leadLocked) {
    const patch: Record<string, unknown> = { interview_date: body.interviewAt };
    if (body.interviewType) patch.interview_type = body.interviewType;
    const { error: ivErr } = await db.from("leads").update(patch).eq("id", leadId);
    if (!ivErr) {
      interviewSet = true;
      // הבוט קבע ראיון — תזכורת "להתקשר שוב" של הרכזת כבר מיותרת
      await completeLeadReminders(db, leadId);
    }
  }

  // 4. Human-attention flag — surfaces a red banner on the lead so recruiters
  //    (not just an admin phone) see they need to step in.
  let escalated = false;
  // המועמד/ת סיפר/ה לגובגט איך שמע/ה עלינו. מחליף ערוץ רק כשהוא לא ידוע —
  // מספר מסקיו או קוד מודעה אמינים יותר מזיכרון של מועמד/ת.
  if (body.heardFrom && body.heardFrom.trim()) {
    const answer = body.heardFrom.trim().slice(0, 200);
    const mapped = channelFromAnswer(answer);
    const { data: cur } = await db.from("leads").select("channel").eq("id", leadId).maybeSingle();
    if (mapped && isUnknownChannel(cur?.channel as string | null)) {
      await db.from("leads").update({ channel: mapped, channel_set_by: "candidate" }).eq("id", leadId);
    }
    await db.from("lead_events").insert({
      lead_id: leadId,
      event_type: "ערוץ",
      event_text: `איך שמע/ה עלינו (לפי המועמד/ת): "${answer}"${mapped ? ` → ${mapped}` : ""}`,
      created_by: "גובגט",
    });
  }

  if (body.escalation && body.escalation.reason) {
    const patch: Record<string, unknown> = {
      needs_human_attention: true,
      human_attention_reason: body.escalation.reason,
      human_attention_raised_at: new Date().toISOString(),
      bot_paused: true, // Gubget froze itself on escalation — stays paused until a recruiter releases it
    };
    // מועמד שמחכה לאדם מקבל רכזת בשם. עד 24.09 כל אלה נשארו על גובגט,
    // וכל הרכזות ראו את אותה ערימה ב"היום שלי" — מה שהפך את "מישהי אחרת
    // בטח מטפלת" לברירת מחדל, ולידים חיכו מיום חמישי עד שני.
    const owner = (existing?.handled_by as string | null)?.trim().toLowerCase();
    if (!owner || owner === GUBGET_EMAIL) {
      const assignee = await pickEscalationOwner(db);
      if (assignee) {
        patch.handled_by = assignee;
        patch.handled_at = new Date().toISOString();
      }
    }
    const { error: attErr } = await db.from("leads").update(patch).eq("id", leadId);
    if (!attErr) escalated = true;
  }

  // 5. Distilled recruiter-style note → the lead's event log, so a recruiter
  //    sees the key facts at a glance without reading the whole chat.
  let noted = false;
  if (body.note && body.note.trim()) {
    const { error: nErr } = await db.from("lead_events").insert({
      lead_id: leadId,
      event_type: "גובגט",
      event_text: body.note.trim().slice(0, 1000),
      created_by: GUBGET_EMAIL,
    });
    if (!nErr) noted = true;
  }

  return NextResponse.json(
    { ok: true, leadId, appended, statusChanged, statusBlocked, statusBlockedReason, interviewSet, escalated, noted },
    { status: 200 }
  );
}
