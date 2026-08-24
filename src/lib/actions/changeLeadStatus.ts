"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import {
  LeadStatus,
  type LeadStatusValue,
  isValidStatus,
  validateTransition,
  type LeadGuardrailData,
} from "@/lib/stateMachine";
import { normalizeEmployerName } from "@/lib/employerNormalization";
import { logAudit } from "@/lib/audit";

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
    interviewDate?: string;
    interviewType?: "in_person" | "video";
    interviewNotes?: string;
    followupNotes?: string;
    screeningScore?: number;
    humanApproval?: boolean;
  };
}

export interface ChangeStatusResult {
  success: boolean;
  error?: string;
}

export async function changeLeadStatus(input: ChangeStatusInput): Promise<ChangeStatusResult> {
  const { leadId, newStatus, userId, notes, extra } = input;

  // 1. Validate target status
  if (!isValidStatus(newStatus)) {
    return { success: false, error: `סטטוס לא חוקי: ${newStatus}` };
  }

  const supabase = getSupabase();

  // 2. Fetch current lead data
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("status, screening_score, human_approval, interview_date")
    .eq("id", leadId)
    .single();

  if (fetchError || !lead) {
    return { success: false, error: `ליד לא נמצא: ${leadId}` };
  }

  const currentStatus = lead.status as LeadStatusValue;

  // Don't do anything if status unchanged
  if (currentStatus === newStatus) {
    return { success: true };
  }

  // 3. Build guardrail data (merge DB data + incoming extra)
  const guardrailData: LeadGuardrailData = {
    screening_score: extra?.screeningScore ?? lead.screening_score,
    human_approval: extra?.humanApproval ?? lead.human_approval,
    interview_date: extra?.interviewDate ?? lead.interview_date,
  };

  // 4. Validate transition
  const validation = validateTransition(currentStatus, newStatus, guardrailData);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // 5. Build update payload
  const updateData: Record<string, unknown> = {
    status: newStatus,
    sub_status: null,
  };

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

  if (newStatus === LeadStatus.EMPLOYMENT_ENDED) {
    // ברירת מחדל: היום (לפי לוח ישראל) אם לא נבחר תאריך בדיאלוג
    updateData.employment_end_date =
      extra?.employmentEndDate ??
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  }

  if (newStatus === LeadStatus.INTERVIEW_BOOKED) {
    if (extra?.interviewDate) updateData.interview_date = extra.interviewDate;
    if (extra?.interviewType) updateData.interview_type = extra.interviewType;
    if (extra?.interviewNotes) updateData.interview_notes = extra.interviewNotes;
    if (extra?.hiredPosition) updateData.hired_position = extra.hiredPosition;
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
  if (userId && userId.includes("@")) {
    updateData.handled_by = userId;
    updateData.handled_at = new Date().toISOString();
  }

  // 6. Update the leads table
  const { error: updateError } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", leadId);

  if (updateError) {
    return { success: false, error: `שגיאה בעדכון: ${updateError.message}` };
  }

  // 7. Log to status history
  await supabase.from("lead_status_history").insert({
    lead_id: leadId,
    from_status: currentStatus,
    to_status: newStatus,
    changed_by: userId ?? "system",
    notes: notes ?? null,
  });

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
    ([k]) => k !== "status" && k !== "sub_status"
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

  return { success: true };
}
