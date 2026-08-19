import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "@/lib/audit";

// ── Privacy operations on a single lead ─────────────────────
// Used by:
//   * GET/DELETE /api/leads/[id]/privacy  — candidate's right of access / erasure
//   * /api/cron/retention                  — automatic data minimisation
//
// Retention policy (חוק הגנת הפרטיות — צמצום מידע):
//   * regular candidates: anonymize 24 months after the last activity
//   * hired / started:   84 months (7y) — employment records carry longer duties
//   * audit_log rows:    24 months (תקנה 10(ד))
export const RETENTION_MONTHS = 24;
export const RETENTION_MONTHS_HIRED = 84;
export const AUDIT_RETENTION_MONTHS = 24;

const DOCS_BUCKET = "lead-documents";

export function privacyAdmin(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Child tables that hold data about the candidate (see migration 00043). */
const CHILD_TABLES = [
  "lead_status_history",
  "lead_events",
  "lead_notes",
  "messages",
  "interaction_logs",
  "reminders",
  "cron_reminders",
  "lead_documents",
  "advances",
  "job_transfers",
] as const;

export interface LeadDataExport {
  exported_at: string;
  lead: Record<string, unknown>;
  related: Record<string, unknown[]>;
  audit_log: unknown[];
}

/**
 * Full copy of everything the system holds about one candidate — the
 * "right of access" (זכות עיון, סעיף 13 לחוק). Documents are listed by
 * metadata only; the files themselves are handed over separately.
 */
export async function exportLeadData(leadId: string): Promise<LeadDataExport | null> {
  const admin = privacyAdmin();
  const { data: lead, error } = await admin.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error || !lead) return null;

  const related: Record<string, unknown[]> = {};
  await Promise.all(
    CHILD_TABLES.map(async (t) => {
      const { data } = await admin.from(t).select("*").eq("lead_id", leadId);
      related[t] = data ?? [];
    })
  );

  const { data: audit } = await admin
    .from("audit_log")
    .select("occurred_at, actor, action, changes, meta")
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: true });

  return {
    exported_at: new Date().toISOString(),
    lead: lead as Record<string, unknown>,
    related,
    audit_log: audit ?? [],
  };
}

/** Remove every storage object attached to the lead. Best-effort. */
async function purgeLeadDocuments(admin: SupabaseClient, leadId: string): Promise<number> {
  const { data: docs } = await admin.from("lead_documents").select("file_path").eq("lead_id", leadId);
  const paths = (docs ?? []).map((d) => d.file_path as string).filter(Boolean);
  if (paths.length === 0) return 0;
  const { error } = await admin.storage.from(DOCS_BUCKET).remove(paths);
  if (error) console.error(`[privacy] storage purge failed for ${leadId}:`, error.message);
  return paths.length;
}

/**
 * Anonymize: strip all personal data, keep the statistical skeleton.
 * This is the default for both retention and erasure requests — it keeps
 * hiring reports honest and is what "מחיקה" means for a recruiter's ledger.
 */
export async function anonymizeLead(
  leadId: string,
  actor: string,
  opts?: { admin?: SupabaseClient; reason?: string }
): Promise<{ ok: boolean; error?: string; filesRemoved?: number }> {
  const admin = opts?.admin ?? privacyAdmin();
  const filesRemoved = await purgeLeadDocuments(admin, leadId);
  const { data, error } = await admin.rpc("anonymize_lead", { p_lead_id: leadId, p_actor: actor });
  if (error) return { ok: false, error: error.message };
  if (data === false) return { ok: false, error: "lead not found" };
  // anonymize_lead() already writes its own audit row; add the reason if given
  if (opts?.reason) {
    await logAudit({ action: "anonymize", leadId, actor, meta: { reason: opts.reason, filesRemoved } });
  }
  return { ok: true, filesRemoved };
}

/**
 * Hard delete: the row and every child disappear (FK cascade). Only for an
 * explicit erasure request where keeping even the skeleton is unwanted.
 * The audit_log row survives on purpose (no FK).
 */
export async function hardDeleteLead(
  leadId: string,
  actor: string,
  reason?: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = privacyAdmin();
  const { data: snapshot } = await admin
    .from("leads")
    .select("status, source, created_at")
    .eq("id", leadId)
    .maybeSingle();
  if (!snapshot) return { ok: false, error: "lead not found" };

  await purgeLeadDocuments(admin, leadId);
  const { error } = await admin.from("leads").delete().eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "delete",
    leadId,
    actor,
    meta: { reason: reason ?? null, hard: true, was: snapshot },
  });
  return { ok: true };
}
