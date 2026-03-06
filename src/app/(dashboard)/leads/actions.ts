"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { LeadStatus } from "@/lib/stateMachine";
import { sendWelcomeMessage } from "@/lib/whatsappWelcome";
import { normalizeEmployerName, type NormalizationResult } from "@/lib/employerNormalization";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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

export async function updateLeadSubStatus(leadId: string, subStatus: string | null) {
  const { error } = await getSupabase()
    .from("leads")
    .update({ sub_status: subStatus })
    .eq("id", leadId);

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
      status: data.status || LeadStatus.NEW_LEAD,
    })
    .select()
    .single();

  if (error) return { lead: null, error: error.message };

  // Fire-and-forget: send WhatsApp welcome if phone exists
  if (lead.phone) {
    sendWelcomeMessage(lead.id, lead.phone).catch(console.error);
  }

  revalidatePath("/leads");
  return { lead, error: null };
}

/**
 * Server action: normalize an employer name against existing employers.
 * Called from client components to show normalization feedback.
 */
export async function normalizeEmployer(name: string): Promise<NormalizationResult> {
  return normalizeEmployerName(name);
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
    start_date?: string;
    hired_client?: string;
  }
) {
  const ageNum = details.age ? parseInt(details.age, 10) : null;

  // Normalize employer name if provided
  let hiredClient: string | null = null;
  if (details.hired_client?.trim()) {
    const norm = await normalizeEmployerName(details.hired_client);
    hiredClient = norm.normalized;
  }

  const updateData: Record<string, unknown> = {
    name: details.name,
    phone: details.phone || null,
    email: details.email || null,
    job_title: details.job_title || null,
    location: details.location || null,
    experience: details.experience || null,
    age: ageNum && ageNum > 0 && ageNum < 120 ? ageNum : null,
    start_date: details.start_date || null,
  };

  // Only update hired_client if explicitly provided (avoid clearing it when not in the form)
  if (details.hired_client !== undefined) {
    updateData.hired_client = hiredClient;
  }

  const { error } = await getSupabase()
    .from("leads")
    .update(updateData)
    .eq("id", leadId);

  if (!error) {
    revalidatePath(`/leads/${leadId}`);
  }

  return { error: error?.message ?? null, normalizedEmployer: hiredClient };
}

// ── Bulk Import ─────────────────────────────────────────────

export interface BulkImportRow {
  name: string;
  phone?: string;
  email?: string;
  job_title?: string;
  hired_client?: string;
  location?: string;
}

export interface BulkImportResult {
  total: number;
  imported: number;
  skipped: number;
  normalized: number;
  errors: string[];
}

export async function bulkImportLeads(
  rows: BulkImportRow[],
  options?: { source?: string }
): Promise<BulkImportResult> {
  const supabase = getSupabase();
  const source = options?.source ?? "ייבוא Excel";
  const result: BulkImportResult = {
    total: rows.length,
    imported: 0,
    skipped: 0,
    normalized: 0,
    errors: [],
  };

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) {
      result.skipped++;
      continue;
    }

    // Normalize employer name if provided
    let hiredClient: string | null = null;
    if (row.hired_client?.trim()) {
      const norm = await normalizeEmployerName(row.hired_client);
      hiredClient = norm.normalized;
      if (norm.wasNormalized) result.normalized++;
    }

    const { error } = await supabase.from("leads").insert({
      name,
      phone: row.phone?.trim() || null,
      email: row.email?.trim() || null,
      job_title: row.job_title?.trim() || null,
      hired_client: hiredClient,
      location: row.location?.trim() || null,
      source,
      status: LeadStatus.FIT_FOR_INTERVIEW,
    });

    if (error) {
      result.errors.push(`${name}: ${error.message}`);
      result.skipped++;
    } else {
      result.imported++;
    }
  }

  revalidatePath("/leads");
  return result;
}
