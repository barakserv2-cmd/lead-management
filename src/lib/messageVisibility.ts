// ============================================================
// Message visibility — who may see which WhatsApp conversations.
//
// Every WhatsApp number belongs to one recruiter (whatsapp_accounts).
//   - Recruiter WITH a linked number: sees + manages conversations on their
//     own number, plus the shared "house" conversations (גובגט, automated
//     messages, legacy rows). Gets pop-ups for those.
//     With user_profiles.sees_shared_chats = false (Mali, 04.10) the house
//     conversations are limited to leads she handles.
//   - Recruiter WITHOUT a linked number: READ-ONLY — can read every
//     conversation's history but cannot send, and gets no pop-ups.
//   - Admin (user_profiles.role = 'אדמין'): sees everything, can send.
// Legacy rows with no instance stamp belong to the default env instance.
// ============================================================

import { createClient as createServerClient } from "@supabase/supabase-js";
import { getAccountForEmail } from "@/lib/whatsappService";
import { exactILike } from "@/lib/api-auth";

const ADMIN_ROLE = "אדמין";

export interface MessageScope {
  /** true → no filtering (admin) */
  all: boolean;
  /** instance ids this user owns */
  instances: string[];
  /** the user's email */
  email: string | null;
  /** may this user send messages? (needs a linked number, or admin) */
  canSend: boolean;
  /** should this user get incoming-message pop-ups? */
  notify: boolean;
  /** sees house conversations (via_instance null) on every lead, not only on her own leads */
  shared: boolean;
}

function admin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getMessageScope(
  email: string | null | undefined
): Promise<MessageScope> {
  if (!email) {
    return { all: false, instances: [], email: null, canSend: false, notify: false, shared: false };
  }
  const lower = email.toLowerCase();

  const [{ data: profile }, personal] = await Promise.all([
    admin().from("user_profiles").select("role, sees_shared_chats").ilike("email", exactILike(lower)).maybeSingle(),
    getAccountForEmail(lower),
  ]);

  if (profile?.role === ADMIN_ROLE) {
    return { all: true, instances: [], email: lower, canSend: true, notify: true, shared: true };
  }
  if (!personal) {
    // read-only viewer
    return { all: true, instances: [], email: lower, canSend: false, notify: false, shared: true };
  }
  return {
    all: false,
    instances: [personal.instanceId],
    email: lower,
    canSend: true,
    notify: true,
    shared: profile?.sees_shared_chats !== false,
  };
}

/** Is this lead one the user handles? House conversations on it are hers even when shared is off. */
export function handlesLead(scope: MessageScope, handledBy: string | null | undefined): boolean {
  return !!scope.email && !!handledBy && handledBy.trim().toLowerCase() === scope.email;
}

/**
 * PostgREST `or` filter string for the scope, or null when unfiltered.
 * NULL via_instance = legacy/business → visible to everyone.
 */
export function scopeFilter(scope: MessageScope, opts: { ownsLead?: boolean } = {}): string | null {
  if (scope.all) return null;
  const parts: string[] = [];
  for (const i of scope.instances) {
    parts.push(`via_instance.eq.${i}`);
  }
  // House conversations — the business line, גובגט (the machine), and legacy
  // rows — carry no personal-instance stamp (via_instance = null). They are
  // shared with every recruiter, unless the recruiter is limited to her own
  // (sees_shared_chats = false) — then only on leads she handles.
  if (scope.shared || opts.ownsLead) parts.push("via_instance.is.null");
  return parts.join(",");
}
