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
    hiredClient?: string;
    hiredPosition?: string;
    interviewDate?: string;
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
  if (newStatus === LeadStatus.REJECTED && extra?.rejectionReason) {
    updateData.rejection_reason = extra.rejectionReason;
  }

  if (newStatus === LeadStatus.HIRED) {
    if (extra?.hiredClient) updateData.hired_client = extra.hiredClient;
    if (extra?.hiredPosition) updateData.hired_position = extra.hiredPosition;
    updateData.human_approval = true;
  }

  if (newStatus === LeadStatus.INTERVIEW_BOOKED) {
    if (extra?.interviewDate) updateData.interview_date = extra.interviewDate;
    if (extra?.interviewNotes) updateData.interview_notes = extra.interviewNotes;
  }

  if (newStatus === LeadStatus.FIT_FOR_INTERVIEW && extra?.screeningScore != null) {
    updateData.screening_score = extra.screeningScore;
  }

  if (extra?.followupNotes) {
    updateData.followup_notes = extra.followupNotes;
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

  // 8. Revalidate
  revalidatePath("/leads");

  return { success: true };
}
