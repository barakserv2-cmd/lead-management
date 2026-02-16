"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function updateLeadStatus(leadId: string, newStatus: string) {
  const { error } = await getSupabase()
    .from("leads")
    .update({ status: newStatus })
    .eq("id", leadId);

  return { error: error?.message ?? null };
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
