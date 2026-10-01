// לא "use server": הפונקציה נקראת רק מקוד שרת (נתיבי API, קרונים, הבוט).
// כ-server action היא הייתה נגישה ב-POST ישיר, עם userId שהקורא בוחר —
// כלומר כל אחד יכול היה לשנות סטטוס ולהתחזות לכל שחקן (ועדת בחינה, 29/09).
// הממשק משנה סטטוס דרך /api/leads/change-status, שמזהה את המשתמש מה-session.

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import {
  LeadStatus,
  type LeadStatusValue,
  isValidStatus,
  validateTransition,
  actorFromUserId,
  type LeadGuardrailData,
} from "@/lib/stateMachine";
import { normalizeEmployerName } from "@/lib/employerNormalization";
import { logAudit } from "@/lib/audit";
import { setMachineConversationMode } from "@/lib/machineBridge";
import { completeLeadReminders, REMINDER_CLEARING_STATUSES } from "@/lib/reminders";
import { isClosedStatus } from "@/lib/attention";
import {
  isEmploymentEndReason,
  employmentEndReasonLabel,
  isNoArrivalReason,
  noArrivalReasonLabel,
} from "@/lib/constants";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface ChangeStatusInput {
  leadId: string;
  newStatus: LeadStatusValue;
  userId?: string;
  notes?: string;
  // Optional extra fields that accompany certain transitions
  extra?: {
    rejectionReason?: string;
    hiredJobId?: string;
    hiredClient?: string;
    hiredPosition?: string;
    startDate?: string;
    employmentEndDate?: string;
    /** code from EMPLOYMENT_END_REASONS */
    employmentEndReason?: string;
    employmentEndNotes?: string;
    /** code from NO_ARRIVAL_REASONS — NO_SHOW / CANCELLED_ARRIVAL */
    noArrivalReason?: string;
    noArrivalNotes?: string;
    interviewDate?: string;
    interviewType?: "phone" | "in_person" | "video";
    interviewNotes?: string;
    followupNotes?: string;
    screeningScore?: number;
    humanApproval?: boolean;
    /** explicit "קח שליטה" — the only way ownership moves off another recruiter */
    claimOwnership?: boolean;
    /**
     * Sub-status that goes with the move ("אין מענה 1", "מעקב"…). Written in
     * the same step as the status — it used to be a second request, and when
     * that one failed the lead kept the new status with no sub-status.
     */
    subStatus?: string;
  };
}

const GUBGET_EMAIL = "gubget@eilatjobs.com";

/** סטטוסים שבהם אין יותר מה לעשות עם המועמד — סוגרים גם את האסקלציות בגובגט */
const LEAD_CLOSED_STATUSES = new Set<string>([
  "REJECTED", "NOT_SUITABLE", "LOST_CONTACT", "NOT_ACCEPTED", "INVALID_PHONE",
  "EMPLOYMENT_ENDED", "NO_SHOW", "CANCELLED_ARRIVAL", "HIRED", "STARTED",
]);
/** סיבת הדגל הנוכחי, או null אם אין דגל פתוח. */
async function currentAttention(
  supabase: ReturnType<typeof getSupabase>,
  leadId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("leads")
    .select("needs_attention, attention_reason")
    .eq("id", leadId)
    .maybeSingle();
  if (!data?.needs_attention) return null;
  return (data.attention_reason as string | null) || "ללא סיבה";
}

export interface ChangeStatusResult {
  success: boolean;
  error?: string;
  /**
   * Why it failed, for callers that react differently:
   * bot_paused — an automated actor tried to move a lead a recruiter froze;
   * conflict — someone else changed the status since it was read.
   */
  reason?: "invalid" | "not_found" | "bot_paused" | "conflict" | "db";
}

/** בעלות אנושית עוצרת כל שינוי אוטומטי, עד שרכזת מחזירה את השיחה ("החזר לגובגט"). */
export const BOT_PAUSED_ERROR =
  "הליד בטיפול רכזת — שינויים אוטומטיים (גובגט / הבוט) לא חלים עליו עד שהשיחה מוחזרת לגובגט";

export const CONFLICT_ERROR = "הסטטוס של הליד השתנה בינתיים על ידי מישהו אחר. רעננו את הדף ונסו שוב.";

export async function changeLeadStatus(input: ChangeStatusInput): Promise<ChangeStatusResult> {
  const { leadId, newStatus, userId, notes, extra } = input;

  // 1. Validate target status
  if (!isValidStatus(newStatus)) {
    return { success: false, error: `סטטוס לא חוקי: ${newStatus}`, reason: "invalid" };
  }

  const supabase = getSupabase();

  // 2. Fetch current lead data
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("status, screening_score, human_approval, interview_date, phone, handled_by, bot_paused")
    .eq("id", leadId)
    .single();

  if (fetchError || !lead) {
    return { success: false, error: `ליד לא נמצא: ${leadId}`, reason: "not_found" };
  }

  const currentStatus = lead.status as LeadStatusValue;
  const actor = actorFromUserId(userId);

  // Status unchanged. A sub-status that came with it (another "אין מענה" on a
  // lead already in "נוצר קשר") is still a real event — write just that.
  if (currentStatus === newStatus) {
    if (extra?.subStatus !== undefined) return writeSubStatusOnly(supabase, leadId, extra.subStatus, userId, actor);
    return { success: true };
  }

  // 2b. A recruiter froze this lead (took the conversation, or moved it by
  // hand). Until someone hands it back, no automated actor moves it.
  // 30.09: 37 times in a month a recruiter cancelled an interview and גובגט's
  // sync booked it again within ten minutes.
  if (actor === "machine" && lead.bot_paused) {
    return { success: false, error: BOT_PAUSED_ERROR, reason: "bot_paused" };
  }

  // 3. Build guardrail data (merge DB data + incoming extra).
  //    "Human approval" for a hire = a human made the move (the hire dialog
  //    is human-only), or it was explicitly granted, or it was already on
  //    the lead. Automated actors can never satisfy it on their own.
  const guardrailData: LeadGuardrailData = {
    actor,
    screening_score: extra?.screeningScore ?? lead.screening_score,
    human_approval: extra?.humanApproval ?? (actor === "human" ? true : lead.human_approval),
    interview_date: extra?.interviewDate ?? lead.interview_date,
  };

  // 4. Validate transition
  const validation = validateTransition(currentStatus, newStatus, guardrailData);
  if (!validation.valid) {
    return { success: false, error: validation.error, reason: "invalid" };
  }

  // 5. Build update payload
  const subStatus = extra?.subStatus?.trim().slice(0, 100) || null;
  const updateData: Record<string, unknown> = {
    status: newStatus,
    sub_status: subStatus,
    sub_status_at: subStatus ? new Date().toISOString() : null,
  };
  // A human moving the lead is now driving it: Gubget stays silent until a
  // recruiter explicitly hands the conversation back ("החזר לגובגט").
  if (actor === "human") updateData.bot_paused = true;

  // ליד שנסגר יוצא מ"גובגט מחכה לך" — אין יותר על מה לחכות. 22.09: 3 לידים
  // סגורים נשארו בתור המשותף שכל הרכזות רואות.
  if (LEAD_CLOSED_STATUSES.has(newStatus)) {
    updateData.needs_human_attention = false;
    updateData.human_attention_reason = null;
    updateData.human_attention_raised_at = null;
  }

  // סגירת ליד מכבה את הדגל "דורש תשומת לב" — ההחלטה כבר התקבלה. בלי זה
  // נצברו 255 דגלים על לידים סגורים (29/09) והדגל הפסיק להגיד משהו.
  // הסיבה נשמרת ביומן (7b) כדי שלא תיעלם.
  const clearedAttention = isClosedStatus(newStatus) ? await currentAttention(supabase, leadId) : null;
  if (clearedAttention) {
    updateData.needs_attention = false;
    updateData.needs_attention_at = null;
    updateData.attention_reason = null;
  }

  // Status-specific field updates
  // "נדחה" ו"לא התקבל" חולקים את אותו שדה סיבה — שניהם סגירה של מועמד,
  // וההפרדה ביניהם היא בסטטוס עצמו.
  if (
    (newStatus === LeadStatus.REJECTED || newStatus === LeadStatus.NOT_ACCEPTED) &&
    extra?.rejectionReason
  ) {
    updateData.rejection_reason = extra.rejectionReason;
  }

  if (newStatus === LeadStatus.HIRED) {
    // Prefer linking to a job — derive client + position from it so
    // free-text drift can't corrupt reports.
    if (extra?.hiredJobId) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, title, client_id, clients(name)")
        .eq("id", extra.hiredJobId)
        .single<{ id: string; title: string; client_id: string; clients: { name: string } | null }>();
      if (job) {
        updateData.hired_job_id = job.id;
        updateData.hired_position = job.title;
        if (job.clients?.name) {
          const norm = await normalizeEmployerName(job.clients.name);
          updateData.hired_client = norm.normalized;
        }
      }
    } else if (extra?.hiredClient) {
      const norm = await normalizeEmployerName(extra.hiredClient);
      updateData.hired_client = norm.normalized;
      if (extra?.hiredPosition) updateData.hired_position = extra.hiredPosition;
    }
    if (extra?.startDate) updateData.start_date = extra.startDate;
    updateData.human_approval = true;
  }

  // תחילת עבודה בפועל — הרכזת יכולה לתקן את התאריך שנקבע בקבלה
  if (newStatus === LeadStatus.STARTED && extra?.startDate) {
    updateData.start_date = extra.startDate;
  }

  if (newStatus === LeadStatus.EMPLOYMENT_ENDED) {
    // ברירת מחדל: היום (לפי לוח ישראל) אם לא נבחר תאריך בדיאלוג
    updateData.employment_end_date =
      extra?.employmentEndDate ??
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    // סיבת העזיבה — הבסיס לדוח השימור. קוד לא מוכר נדחה ולא נשמר כטקסט חופשי.
    if (extra?.employmentEndReason) {
      if (!isEmploymentEndReason(extra.employmentEndReason)) {
        return { success: false, error: `סיבת סיום לא חוקית: ${extra.employmentEndReason}`, reason: "invalid" };
      }
      updateData.employment_end_reason = extra.employmentEndReason;
    }
    const endNotes = extra?.employmentEndNotes?.trim();
    if (endNotes) updateData.employment_end_notes = endNotes;
  }

  // "לא הגיע" / "ביטל הגעה" — הסיבה נשארת על הליד גם כשהוא מתקדם הלאה
  // (למשל תיאום הגעה מחדש), כך שדוח ההגעה יודע שהיה ניסיון שנכשל ולמה.
  if (
    (newStatus === LeadStatus.NO_SHOW || newStatus === LeadStatus.CANCELLED_ARRIVAL) &&
    extra?.noArrivalReason
  ) {
    if (!isNoArrivalReason(extra.noArrivalReason)) {
      return { success: false, error: `סיבת אי-הגעה לא חוקית: ${extra.noArrivalReason}`, reason: "invalid" };
    }
    updateData.no_arrival_reason = extra.noArrivalReason;
    updateData.no_arrival_notes = extra.noArrivalNotes?.trim() || null;
  }

  if (newStatus === LeadStatus.INTERVIEW_BOOKED) {
    if (extra?.interviewDate) updateData.interview_date = extra.interviewDate;
    if (extra?.interviewType) updateData.interview_type = extra.interviewType;
    if (extra?.interviewNotes) updateData.interview_notes = extra.interviewNotes;
    if (extra?.hiredPosition) updateData.hired_position = extra.hiredPosition;
  }

  // "דחה הגעה" carries the NEW interview date. We keep the ORIGINAL date in
  // postponed_from_date so the candidate shows on BOTH days (the day they were
  // meant to arrive and postponed, and the new day) on the board and in the
  // Excel report.
  if (newStatus === LeadStatus.POSTPONED_ARRIVAL) {
    if (extra?.interviewDate) {
      // preserve the first-appointment date only on a real reschedule
      if (lead.interview_date) updateData.postponed_from_date = lead.interview_date;
      updateData.interview_date = extra.interviewDate;
    }
    if (extra?.interviewType) updateData.interview_type = extra.interviewType;
  }

  if (newStatus === LeadStatus.FIT_FOR_INTERVIEW && extra?.screeningScore != null) {
    updateData.screening_score = extra.screeningScore;
  }

  if (extra?.followupNotes) {
    updateData.followup_notes = extra.followupNotes;
  }

  // 5b. Attribute handling to the recruiter who moved the lead — real user
  // emails only (skip automated "system"/"ai-recruiter"/"user"). Powers the
  // "לידים של היום" board that splits today's leads by recruiter.
  //
  // Ownership is NOT stolen by touching someone else's candidate. Tami:
  // "אני רוצה לשנות לחושן משהו בתוך מועמד ולא רוצה שהוא יעבור על שמי".
  // A lead that another recruiter already owns keeps its owner; the action is
  // still attributed in lead_status_history.changed_by. Ownership moves only
  // when the lead is unowned / owned by גובגט, or on an explicit takeover
  // (extra.claimOwnership, set by the "קח שליטה" routes).
  // Recruiters only: גובגט claims its own leads in the bridge, and a move by
  // a machine is not a conversation with the candidate.
  if (actor === "human" && userId && userId.includes("@")) {
    const currentOwner = (lead.handled_by as string | null)?.trim() || null;
    const ownedByAnotherRecruiter =
      !!currentOwner && currentOwner !== GUBGET_EMAIL && currentOwner.toLowerCase() !== userId.toLowerCase();
    if (!ownedByAnotherRecruiter || extra?.claimOwnership) {
      updateData.handled_by = userId;
      updateData.handled_at = new Date().toISOString();
    }
    // מעבר סטטוס ידני בא אחרי שיחה — נחשב מגע אחרון עם המועמד, גם כשהבעלות
    // נשארת אצל רכזת אחרת
    updateData.last_contact_at = new Date().toISOString();
  }

  // 6. Update the lead and write its history in one step — and only if the
  // status is still the one validated above (migration 00102). Two people
  // moving the same lead at once used to both pass validation, and the later
  // write won silently; a failed history insert went unnoticed.
  const { data: applied, error: updateError } = await supabase.rpc("transition_lead_status", {
    p_lead_id: leadId,
    p_from: currentStatus,
    p_patch: updateData,
    p_changed_by: userId ?? "system",
    p_notes: notes ?? null,
  });

  if (updateError) {
    return { success: false, error: `שגיאה בעדכון: ${updateError.message}`, reason: "db" };
  }
  if (applied !== true) {
    return { success: false, error: CONFLICT_ERROR, reason: "conflict" };
  }

  // Tell Gubget to stop talking to this candidate — best-effort: bot_paused
  // is already persisted above, and the machine re-checks it on every inbound
  // message, so a missed call here can't let the bot keep going.
  if (actor === "human" && lead.phone) {
    // סטטוס סופי סוגר גם את האסקלציות בגובגט (22.09 — הן נשארו פתוחות לנצח)
    const closedStatus = LEAD_CLOSED_STATUSES.has(newStatus) ? newStatus : undefined;
    setMachineConversationMode(lead.phone as string, "human", closedStatus).catch(() => undefined);
  }

  // תזכורת "להתקשר שוב" שאין בה יותר צורך — ראיון נקבע או שהליד נסגר.
  if (REMINDER_CLEARING_STATUSES.has(newStatus)) {
    await completeLeadReminders(supabase, leadId);
  }

  // 7. (the status history row was written with the update, in step 6)

  // 7b. כל טקסט חופשי שהרכזת כתבה במעבר נרשם גם ביומן האירועים,
  // כדי שההיסטוריה תשמור אותו גם אחרי שהשדה יידרס בעדכון הבא.
  const journalRows: { event_type: string; event_text: string }[] = [];
  if (extra?.rejectionReason) {
    const isNotAccepted = newStatus === LeadStatus.NOT_ACCEPTED;
    journalRows.push({
      event_type: isNotAccepted ? "לא התקבל" : "דחייה",
      event_text: `${isNotAccepted ? "סיבת אי-קבלה" : "סיבת דחייה"}: ${extra.rejectionReason}`,
    });
  }
  if (newStatus === LeadStatus.EMPLOYMENT_ENDED && extra?.employmentEndReason) {
    const endNotes = extra.employmentEndNotes?.trim();
    journalRows.push({
      event_type: "סיום העסקה",
      event_text:
        `סיבת סיום: ${employmentEndReasonLabel(extra.employmentEndReason)}` + (endNotes ? ` — ${endNotes}` : ""),
    });
  }
  if (
    (newStatus === LeadStatus.NO_SHOW || newStatus === LeadStatus.CANCELLED_ARRIVAL) &&
    extra?.noArrivalReason
  ) {
    const naNotes = extra.noArrivalNotes?.trim();
    journalRows.push({
      event_type: newStatus === LeadStatus.NO_SHOW ? "לא הגיע" : "ביטל הגעה",
      event_text: `סיבה: ${noArrivalReasonLabel(extra.noArrivalReason)}` + (naNotes ? ` — ${naNotes}` : ""),
    });
  }
  if (clearedAttention) {
    journalRows.push({
      event_type: "דגל נוקה",
      event_text: `הליד נסגר (${newStatus}) — הדגל "דורש תשומת לב" כובה. הסיבה שהייתה: ${clearedAttention}`,
    });
  }
  if (extra?.interviewNotes) journalRows.push({ event_type: "ראיון", event_text: `הערות ראיון: ${extra.interviewNotes}` });
  if (extra?.followupNotes) journalRows.push({ event_type: "מעקב", event_text: `הערות מעקב: ${extra.followupNotes}` });
  if (journalRows.length > 0) {
    // best-effort: אם הטבלה חסרה או שגיאה — המעבר עצמו כבר הצליח
    await supabase.from("lead_events").insert(
      journalRows.map((r) => ({ ...r, lead_id: leadId, created_by: userId ?? "system" }))
    ).then(() => undefined, () => undefined);
  }

  // 7c. Audit trail (תקנה 10) — who moved which record, from/to, plus any
  // extra fields that were written in the same transition.
  const extraWritten = Object.entries(updateData).filter(
    ([k, v]) => k !== "status" && !(k === "sub_status" && v === null)
  );
  await logAudit({
    action: "status_change",
    leadId,
    actor: userId ?? "system",
    changes: {
      status: { from: currentStatus, to: newStatus },
      ...Object.fromEntries(extraWritten.map(([k, v]) => [k, { from: null, to: v }])),
    },
    meta: notes ? { notes } : null,
  });

  // 8. Revalidate
  revalidatePath("/leads");
  revalidatePath("/today");
  revalidatePath("/interviews");
  revalidatePath("/reports");

  return { success: true };
}

/** אותו סטטוס, תת-סטטוס חדש — ניסיון חיוג נוסף ("אין מענה 2") על ליד שכבר ב"נוצר קשר". */
async function writeSubStatusOnly(
  supabase: ReturnType<typeof getSupabase>,
  leadId: string,
  rawSubStatus: string,
  userId: string | undefined,
  actor: ReturnType<typeof actorFromUserId>
): Promise<ChangeStatusResult> {
  const subStatus = rawSubStatus.trim().slice(0, 100) || null;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { sub_status: subStatus, sub_status_at: subStatus ? now : null };
  // ניסיון חיוג הוא נקודת הזמן שמתעדת את הקשר האחרון
  if (actor === "human") patch.last_contact_at = now;
  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (error) return { success: false, error: `שגיאה בעדכון: ${error.message}`, reason: "db" };
  await logAudit({
    action: "update",
    leadId,
    actor: userId ?? "system",
    changes: { sub_status: { from: null, to: subStatus } },
  });
  revalidatePath("/leads");
  revalidatePath("/today");
  return { success: true };
}
