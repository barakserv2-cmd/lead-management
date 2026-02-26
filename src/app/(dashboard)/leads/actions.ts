"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { LEAD_STATUSES } from "@/lib/constants";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function logStatusChange(leadId: string, fromStatus: string | null, toStatus: string) {
  await getSupabase().from("lead_status_history").insert({
    lead_id: leadId,
    from_status: fromStatus,
    to_status: toStatus,
  });
}

export async function getStatusHistory(leadId: string) {
  const { data, error } = await getSupabase()
    .from("lead_status_history")
    .select("*")
    .eq("lead_id", leadId)
    .order("changed_at", { ascending: true });

  if (error) return { history: [], error: error.message };
  return { history: data ?? [], error: null };
}

export async function updateLeadStatus(
  leadId: string,
  newStatus: string,
  extra?: { rejectionReason?: string; hiredClient?: string; hiredPosition?: string; interviewDate?: string; interviewNotes?: string }
) {
  const supabase = getSupabase();

  // Fetch current status before update
  const { data: current } = await supabase
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .single();

  const previousStatus = current?.status ?? null;

  const updateData: Record<string, unknown> = {
    status: newStatus,
    sub_status: null,
    rejection_reason: newStatus === LEAD_STATUSES.NOT_RELEVANT ? (extra?.rejectionReason ?? null) : null,
    hired_client: newStatus === LEAD_STATUSES.ACCEPTED ? (extra?.hiredClient ?? null) : null,
    hired_position: newStatus === LEAD_STATUSES.ACCEPTED ? (extra?.hiredPosition ?? null) : null,
    interview_date: newStatus === LEAD_STATUSES.INTERVIEW ? (extra?.interviewDate ?? null) : null,
    interview_notes: newStatus === LEAD_STATUSES.INTERVIEW ? (extra?.interviewNotes ?? null) : null,
  };

  const { error } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", leadId);

  if (!error) {
    await logStatusChange(leadId, previousStatus, newStatus);
  }

  return { error: error?.message ?? null };
}

export async function updateLeadSubStatus(leadId: string, subStatus: string | null) {
  const { error } = await getSupabase()
    .from("leads")
    .update({ sub_status: subStatus })
    .eq("id", leadId);

  return { error: error?.message ?? null };
}

export async function updateLeadStatusWithRole(leadId: string, newStatus: string, role: string, clientName?: string) {
  const supabase = getSupabase();

  // Fetch current status + preferences before update
  const { data: current } = await supabase
    .from("leads")
    .select("status, preferences")
    .eq("id", leadId)
    .single();

  const previousStatus = current?.status ?? null;

  // Merge matched_client into existing preferences
  let prefs: Record<string, unknown> = {};
  if (clientName) {
    prefs = { ...(current?.preferences as Record<string, unknown> ?? {}), matched_client: clientName };
  }

  const updateData: Record<string, unknown> = { status: newStatus, job_title: role };
  if (clientName) updateData.preferences = prefs;

  const { error } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", leadId);

  if (!error) {
    await logStatusChange(leadId, previousStatus, newStatus);
  }

  return { error: error?.message ?? null };
}

export async function getActiveClients() {
  const { data, error } = await getSupabase()
    .from("clients")
    .select("id, name")
    .eq("status", "Active")
    .order("name");

  if (error) return { clients: [], error: error.message };
  return { clients: data ?? [], error: null };
}

export async function getOpenJobs() {
  const { data, error } = await getSupabase()
    .from("jobs")
    .select("id, title, client_id, clients(name)")
    .eq("status", "Open")
    .order("created_at", { ascending: false });

  if (error) return { jobs: [], error: error.message };
  return { jobs: data ?? [], error: null };
}

export async function getLeadNotes(leadId: string) {
  const { data, error } = await getSupabase()
    .from("leads")
    .select("notes")
    .eq("id", leadId)
    .single();

  if (error) return { notes: null, error: error.message };
  return { notes: (data?.notes as string) ?? "", error: null };
}

export async function updateLeadNotes(leadId: string, notes: string) {
  const { error } = await getSupabase()
    .from("leads")
    .update({ notes })
    .eq("id", leadId);

  return { error: error?.message ?? null };
}

export async function updateLeadPreferences(
  leadId: string,
  preferences: Record<string, unknown>
) {
  const { error } = await getSupabase()
    .from("leads")
    .update({ preferences })
    .eq("id", leadId);

  return { error: error?.message ?? null };
}

export async function updateLeadField(
  leadId: string,
  field: string,
  value: string
) {
  const { error } = await getSupabase()
    .from("leads")
    .update({ [field]: value })
    .eq("id", leadId);

  return { error: error?.message ?? null };
}

// ── Interaction Logs ────────────────────────────────────────

export async function getInteractionLogs(leadId: string) {
  const { data, error } = await getSupabase()
    .from("interaction_logs")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) return { logs: [], error: error.message };
  return { logs: data ?? [], error: null };
}

export async function createInteractionLog(
  leadId: string,
  type: string,
  outcome: string,
  notes: string
) {
  const { data, error } = await getSupabase()
    .from("interaction_logs")
    .insert({ lead_id: leadId, type, outcome, notes: notes || null })
    .select()
    .single();

  if (error) return { log: null, error: error.message };
  return { log: data, error: null };
}

// ── Reminders ───────────────────────────────────────────────

export async function getActiveReminders(leadId: string) {
  const { data, error } = await getSupabase()
    .from("reminders")
    .select("*")
    .eq("lead_id", leadId)
    .eq("is_completed", false)
    .order("due_date", { ascending: true });

  if (error) return { reminders: [], error: error.message };
  return { reminders: data ?? [], error: null };
}

export async function createReminder(
  leadId: string,
  title: string,
  dueDate: string,
  priority: string
) {
  const { data, error } = await getSupabase()
    .from("reminders")
    .insert({ lead_id: leadId, title, due_date: dueDate, priority })
    .select()
    .single();

  if (error) return { reminder: null, error: error.message };
  return { reminder: data, error: null };
}

export async function completeReminder(reminderId: string) {
  const { error } = await getSupabase()
    .from("reminders")
    .update({ is_completed: true })
    .eq("id", reminderId);

  return { error: error?.message ?? null };
}

export async function createLead(data: {
  name: string;
  phone: string;
  job_title: string;
  source: string;
  status: string;
}) {
  const { data: lead, error } = await getSupabase()
    .from("leads")
    .insert({
      name: data.name,
      phone: data.phone || null,
      job_title: data.job_title || null,
      source: data.source || "אחר",
      status: data.status || "חדש",
    })
    .select()
    .single();

  if (error) return { lead: null, error: error.message };

  revalidatePath("/leads");
  return { lead, error: null };
}

export async function updateLeadDetails(
  leadId: string,
  details: {
    name: string;
    phone: string;
    email: string;
    job_title: string;
    location: string;
    experience: string;
    age: string;
  }
) {
  const ageNum = details.age ? parseInt(details.age, 10) : null;
  const { error } = await getSupabase()
    .from("leads")
    .update({
      name: details.name,
      phone: details.phone || null,
      email: details.email || null,
      job_title: details.job_title || null,
      location: details.location || null,
      experience: details.experience || null,
      age: ageNum && ageNum > 0 && ageNum < 120 ? ageNum : null,
    })
    .eq("id", leadId);

  if (!error) {
    revalidatePath(`/leads/${leadId}`);
  }

  return { error: error?.message ?? null };
}
