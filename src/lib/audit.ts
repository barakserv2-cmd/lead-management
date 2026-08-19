import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

// ── Audit log (תקנה 10 לתקנות אבטחת מידע) ──────────────────
// Every read/write of a candidate record is written to `audit_log`
// (migration 00045). Writes are best-effort: an audit failure must never
// break the recruiter's action, but it is logged to the server console so
// it shows up in Vercel logs.

export type AuditAction =
  | "view"
  | "list"
  | "create"
  | "update"
  | "status_change"
  | "note"
  | "export"
  | "anonymize"
  | "delete"
  | "merge"
  | "import"
  | "login";

export type AuditActorType = "user" | "system" | "cron" | "api";

export interface AuditEntry {
  action: AuditAction;
  leadId?: string | null;
  entity?: string;
  /** actor email; resolved from the session cookie when omitted */
  actor?: string | null;
  actorType?: AuditActorType;
  /** field-level diff: { field: { from, to } } */
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  meta?: Record<string, unknown> | null;
  /** pass the incoming Request to capture ip / user-agent; falls back to headers() */
  request?: Request | null;
}

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Email of the signed-in recruiter, or null (cron / api-key / no session). */
export async function currentActor(): Promise<string | null> {
  try {
    const supabase = await createCookieClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}

async function requestContext(req?: Request | null): Promise<{ ip: string | null; ua: string | null }> {
  try {
    const h = req ? req.headers : await headers();
    const fwd = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "";
    const ip = fwd.split(",")[0]?.trim() || null;
    const ua = h.get("user-agent")?.slice(0, 300) ?? null;
    return { ip, ua };
  } catch {
    return { ip: null, ua: null };
  }
}

/**
 * Compute a {field: {from, to}} diff between two partial records, only for
 * the keys present in `next`. Returns null when nothing actually changed.
 */
export function diffFields(
  prev: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> | null {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, to] of Object.entries(next)) {
    const from = prev?.[k] ?? null;
    const a = JSON.stringify(from ?? null);
    const b = JSON.stringify(to ?? null);
    if (a !== b) out[k] = { from: from ?? null, to: to ?? null };
  }
  return Object.keys(out).length ? out : null;
}

/** Write one audit row. Never throws. */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const actor = entry.actor ?? (await currentActor()) ?? "system";
    const actorType: AuditActorType =
      entry.actorType ?? (actor.includes("@") ? "user" : "system");
    const { ip, ua } = await requestContext(entry.request);

    const { error } = await admin().from("audit_log").insert({
      actor,
      actor_type: actorType,
      action: entry.action,
      entity: entry.entity ?? "lead",
      lead_id: entry.leadId ?? null,
      changes: entry.changes ?? null,
      meta: entry.meta ?? null,
      ip,
      user_agent: ua,
    });
    if (error) console.error("[audit] insert failed:", error.message);
  } catch (err) {
    console.error("[audit] unexpected:", err instanceof Error ? err.message : err);
  }
}
