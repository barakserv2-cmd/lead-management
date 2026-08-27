"use server";

import crypto from "crypto";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { LeadStatus } from "@/lib/stateMachine";
import { normalizeEmployerName, type NormalizationResult } from "@/lib/employerNormalization";
import { logAudit, diffFields } from "@/lib/audit";
import { findLeadByPhone, isPhoneUniqueViolation, DUPLICATE_PHONE_MESSAGE } from "@/lib/leadPhoneGuard";
import { normalizePhone } from "@/lib/phone";

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
  // תת-סטטוס נקבע אחרי ניסיון חיוג ("אין מענה 1/2/3", "מעקב") — זו נקודת
  // הזמן היחידה שמתעדת את הניסיון, ולכן היא מעדכנת גם את מועד הקשר האחרון.
  const { error } = await getSupabase()
    .from("leads")
    .update({ sub_status: subStatus, last_contact_at: new Date().toISOString() })
    .eq("id", leadId);

  if (!error) {
    await logAudit({ action: "update", leadId, changes: { sub_status: { from: null, to: subStatus } } });
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
    .select("id, title, client_id, pay_rate, urgent, clients(name)")
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
  const supabase = getSupabase();
  const { error } = await supabase
    .from("leads")
    .update({ notes })
    .eq("id", leadId);

  // כל שמירת הערה נרשמת גם ביומן האירועים — כך נשמרת היסטוריה מלאה
  // של מה שהרכזת כתבה, גם כשהשדה עצמו נדרס בעריכה הבאה.
  if (!error && notes.trim()) {
    let author = "רכזת";
    try {
      const cookieClient = await createCookieClient();
      const { data: { user } } = await cookieClient.auth.getUser();
      if (user?.email) author = user.email;
    } catch {
      // אין session (קריאה ממערכת) — נשאר "רכזת"
    }
    await supabase.from("lead_events").insert({
      lead_id: leadId,
      event_type: "הערה",
      event_text: notes.trim(),
      created_by: author,
    }).then(() => undefined, () => undefined);
  }
  if (!error) {
    // the note text itself lives in lead_events; the audit row only says
    // "notes field was written" (length) to avoid duplicating PII in the log
    await logAudit({ action: "note", leadId, meta: { length: notes.trim().length } });
  }

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

  if (!error) {
    await logAudit({ action: "update", leadId, meta: { fields: ["preferences"] } });
  }
  return { error: error?.message ?? null };
}

export async function updateLeadField(
  leadId: string,
  field: string,
  value: string
) {
  const supabase = getSupabase();
  const { data: before } = await supabase
    .from("leads")
    .select(field)
    .eq("id", leadId)
    .maybeSingle();

  const { error } = await supabase
    .from("leads")
    .update({ [field]: value })
    .eq("id", leadId);

  if (!error) {
    const changes = diffFields(before as Record<string, unknown> | null, { [field]: value });
    if (changes) await logAudit({ action: "update", leadId, changes });
  }
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
    phone2?: string;
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
    phone: normalizePhone(details.phone),
    phone2: normalizePhone(details.phone2),
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

  const supabase = getSupabase();

  // Phone must stay unique across candidates (00047). Pre-check so the UI can
  // link to the existing card instead of showing a raw constraint error.
  const existing = await findLeadByPhone(supabase, details.phone, leadId);
  if (existing) {
    return {
      error: DUPLICATE_PHONE_MESSAGE,
      normalizedEmployer: null as string | null,
      duplicate: { id: existing.id, name: existing.name },
    };
  }

  const { data: before } = await supabase
    .from("leads")
    .select(Object.keys(updateData).join(","))
    .eq("id", leadId)
    .maybeSingle();

  const { error } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", leadId);

  if (!error) {
    const changes = diffFields(before as Record<string, unknown> | null, updateData);
    if (changes) await logAudit({ action: "update", leadId, changes });
    revalidatePath(`/leads/${leadId}`);
  }

  if (error && isPhoneUniqueViolation(error)) {
    const dup = await findLeadByPhone(supabase, details.phone, leadId);
    return {
      error: DUPLICATE_PHONE_MESSAGE,
      normalizedEmployer: null as string | null,
      duplicate: dup ? { id: dup.id, name: dup.name } : undefined,
    };
  }

  return { error: error?.message ?? null, normalizedEmployer: hiredClient, duplicate: undefined as { id: string; name: string | null } | undefined };
}

// ── Clear arrival dates (dev tool) ──────────────────────────

export async function clearAllArrivalDates(): Promise<{ cleared: number; error: string | null }> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("leads")
    .update({ arrival_date: null })
    .not("arrival_date", "is", null)
    .select("id");

  if (error) return { cleared: 0, error: error.message };
  await logAudit({ action: "update", entity: "leads_bulk", meta: { op: "clearAllArrivalDates", count: data?.length ?? 0 } });
  revalidatePath("/leads");
  return { cleared: data?.length ?? 0, error: null };
}

// ── NUKE: Delete all Excel/extras imported leads ─────────────

export async function nukeAllExtrasLeads(): Promise<{ deleted: number; error: string | null }> {
  const supabase = getSupabase();

  // Delete leads whose source matches any Excel/extras import tag
  const { data, error } = await supabase
    .from("leads")
    .delete()
    .or("source.ilike.%Excel%,source.ilike.%אקסטרות%")
    .select("id");

  if (error) return { deleted: 0, error: error.message };
  await logAudit({
    action: "delete",
    entity: "leads_bulk",
    meta: { op: "nukeAllExtrasLeads", count: data?.length ?? 0, ids: (data ?? []).map((d) => d.id) },
  });
  revalidatePath("/leads");
  revalidatePath("/campaigns");
  return { deleted: data?.length ?? 0, error: null };
}

// ── Bulk Import ─────────────────────────────────────────────

export interface BulkImportRow {
  name: string;
  phone?: string;
  email?: string;
  job_title?: string;
  hired_client?: string;
  location?: string;
  arrival_date?: string;
  is_candidate?: boolean;
}

export interface BulkImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  normalized: number;
  errors: string[];
}

const CHUNK_SIZE = 50;

export async function bulkImportLeads(
  rows: BulkImportRow[],
  options?: { source?: string }
): Promise<BulkImportResult> {
  const supabase = getSupabase();
  const source = options?.source ?? "ייבוא Excel";
  const result: BulkImportResult = {
    total: rows.length,
    imported: 0,
    updated: 0,
    skipped: 0,
    normalized: 0,
    errors: [],
  };

  // ── 1. Validate & collect valid rows ───────────────────────
  const validRows: { row: BulkImportRow; name: string; phone: string | null; isDummy: boolean }[] = [];
  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) { result.skipped++; continue; }
    // canonical 10-digit form so the existing-phone check and the
    // ON CONFLICT (phone) upsert both work per candidate, not per string
    const rawPhone = normalizePhone(row.phone);
    const isDummy = !rawPhone || rawPhone.startsWith("no-phone-");
    validRows.push({ row, name, phone: isDummy ? null : rawPhone, isDummy });
  }

  if (validRows.length === 0) return result;

  // ── 2. Normalize employers in bulk (fetch DB once) ─────────
  const uniqueEmployers = new Set<string>();
  for (const { row } of validRows) {
    const emp = row.hired_client?.trim();
    if (emp) uniqueEmployers.add(emp);
  }

  const employerCache = new Map<string, { normalized: string; wasNormalized: boolean }>();
  if (uniqueEmployers.size > 0) {
    // Fetch existing employer names once
    const { data: existingRows } = await supabase
      .from("leads")
      .select("hired_client")
      .not("hired_client", "is", null);

    const existingNames = new Set<string>();
    existingRows?.forEach((r: { hired_client: string }) => {
      const n = r.hired_client?.trim();
      if (n) existingNames.add(n);
    });
    const existingArr = Array.from(existingNames);

    for (const emp of uniqueEmployers) {
      if (existingArr.length === 0) {
        employerCache.set(emp, { normalized: emp, wasNormalized: false });
        continue;
      }
      const exact = existingArr.find(e => e.toLowerCase() === emp.toLowerCase());
      if (exact) {
        employerCache.set(emp, { normalized: exact, wasNormalized: exact !== emp });
        continue;
      }
      // Dynamic import avoided — normalizeEmployerName already imported
      const norm = await normalizeEmployerName(emp);
      employerCache.set(emp, { normalized: norm.normalized, wasNormalized: norm.wasNormalized });
      // Add to existing list so subsequent lookups can match against it
      if (!existingNames.has(norm.normalized)) {
        existingNames.add(norm.normalized);
        existingArr.push(norm.normalized);
      }
    }
  }

  // ── 3. Check which real phones already exist (batch query) ─
  const realPhones = validRows.filter(v => !v.isDummy).map(v => v.phone!);
  const existingPhones = new Set<string>();

  for (let i = 0; i < realPhones.length; i += CHUNK_SIZE) {
    const phoneChunk = realPhones.slice(i, i + CHUNK_SIZE);
    if (phoneChunk.length === 0) continue;
    const { data } = await supabase
      .from("leads")
      .select("phone")
      .in("phone", phoneChunk);
    data?.forEach((r: { phone: string }) => { if (r.phone) existingPhones.add(r.phone); });
  }

  // ── 4. Build payloads ──────────────────────────────────────
  interface LeadPayload {
    name: string;
    phone: string | null;
    email: string | null;
    job_title: string | null;
    hired_client: string | null;
    location: string | null;
    arrival_date: string | null;
    source: string;
    status?: string;
    is_candidate: boolean;
  }

  const realPhoneNew: (LeadPayload & { phone: string })[] = [];
  const realPhoneUpdate: (LeadPayload & { phone: string })[] = [];
  const noPhoneInserts: LeadPayload[] = [];

  for (const { row, name, phone, isDummy } of validRows) {
    const emp = row.hired_client?.trim();
    let hiredClient: string | null = null;
    if (emp) {
      const cached = employerCache.get(emp);
      if (cached) {
        hiredClient = cached.normalized;
        if (cached.wasNormalized) result.normalized++;
      } else {
        hiredClient = emp;
      }
    }

    const base = {
      name,
      email: row.email?.trim() || null,
      job_title: row.job_title?.trim() || null,
      hired_client: hiredClient,
      location: row.location?.trim() || null,
      arrival_date: row.arrival_date || null,
      source,
    };

    if (isDummy) {
      noPhoneInserts.push({ ...base, phone: null, status: LeadStatus.FIT_FOR_INTERVIEW, is_candidate: false });
    } else if (existingPhones.has(phone!)) {
      realPhoneUpdate.push({ ...base, phone: phone!, status: LeadStatus.FIT_FOR_INTERVIEW, is_candidate: true });
    } else {
      realPhoneNew.push({ ...base, phone: phone!, status: LeadStatus.FIT_FOR_INTERVIEW, is_candidate: true });
    }
  }

  // ── 4b. Deduplicate by phone (keep last occurrence) ────────
  // PostgreSQL cannot update the same row twice in one upsert batch
  const dedup = (arr: (LeadPayload & { phone: string })[]) => {
    const map = new Map<string, LeadPayload & { phone: string }>();
    for (const p of arr) map.set(p.phone, p);
    return Array.from(map.values());
  };
  const dedupNew = dedup(realPhoneNew);
  const dedupUpdate = dedup(realPhoneUpdate);
  // Also remove from "new" any phone that appears in "update" (edge case: same phone in both)
  const updatePhones = new Set(dedupUpdate.map(p => p.phone));
  const finalNew = dedupNew.filter(p => !updatePhones.has(p.phone));

  const dupsRemoved = (realPhoneNew.length - finalNew.length) + (realPhoneUpdate.length - dedupUpdate.length);
  if (dupsRemoved > 0) console.log(`[bulkImport] removed ${dupsRemoved} duplicate phone entries`);

  // Debug log
  console.log(`[bulkImport] new(phone): ${finalNew.length}, update: ${dedupUpdate.length}, no-phone: ${noPhoneInserts.length}`);
  const anySample = finalNew[0] || dedupUpdate[0] || noPhoneInserts[0];
  if (anySample) {
    console.log("[bulkImport] sample:", { name: anySample.name, phone: anySample.phone, hired_client: anySample.hired_client, arrival_date: anySample.arrival_date });
  }

  // ── 5. Merge ALL payloads into one array ────────────────────
  // No-phone records get a unique dummy phone so they can go through the same upsert path
  const allPayloads = [
    ...finalNew,
    ...dedupUpdate,
    ...noPhoneInserts.map(r => ({
      ...r,
      phone: `no-phone-${crypto.randomUUID()}`,
    })),
  ];

  for (let i = 0; i < allPayloads.length; i += CHUNK_SIZE) {
    // ULTIMATE SAFETY NET: guarantee status + phone on EVERY record
    const safeChunk = allPayloads.slice(i, i + CHUNK_SIZE).map(lead => ({
      ...lead,
      status: lead.status || LeadStatus.FIT_FOR_INTERVIEW,
      phone: lead.phone || `no-phone-${crypto.randomUUID()}`,
    }));

    try {
      const { error } = await supabase
        .from("leads")
        .upsert(safeChunk, { onConflict: "phone" });

      if (error) {
        console.error(`[bulkImport] upsert chunk error:`, error.message);
        result.errors.push(`Upsert: ${error.message}`);
        result.skipped += safeChunk.length;
      } else {
        for (const rec of safeChunk) {
          if (existingPhones.has(rec.phone)) {
            result.updated++;
          } else {
            result.imported++;
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Upsert: ${msg}`);
      result.skipped += safeChunk.length;
    }
  }

  await logAudit({
    action: "import",
    entity: "leads_bulk",
    meta: { source, total: result.total, imported: result.imported, updated: result.updated, skipped: result.skipped },
  });
  revalidatePath("/leads");
  return result;
}
