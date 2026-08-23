// ============================================================
// Message visibility — who may see which WhatsApp conversations.
//
// Every WhatsApp number belongs to one recruiter (whatsapp_accounts).
//   - Recruiter WITH a linked number: sees + manages only conversations on
//     their own number. Gets pop-ups only for those.
//   - Recruiter WITHOUT a linked number: READ-ONLY — can read every
//     conversation's history but cannot send, and gets no pop-ups.
//   - Admin (user_profiles.role = 'אדמין'): sees everything, can send.
// Legacy rows with no instance stamp belong to the default env instance.
// ============================================================

import { createClient as createServerClient } from "@supabase/supabase-js";
import { businessAccount, getAccountForEmail } from "@/lib/whatsappService";

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
    return { all: false, instances: [], email: null, canSend: false, notify: false };
  }
  const lower = email.toLowerCase();

  const [{ data: profile }, personal] = await Promise.all([
    admin().from("user_profiles").select("role").ilike("email", lower).maybeSingle(),
    getAccountForEmail(lower),
  ]);

  if (profile?.role === ADMIN_ROLE) {
    return { all: true, instances: [], email: lower, canSend: true, notify: true };
  }
  if (!personal) {
    // read-only viewer
    return { all: true, instances: [], email: lower, canSend: false, notify: false };
  }
  return {
    all: false,
    instances: [personal.instanceId],
    email: lower,
    canSend: true,
    notify: true,
  };
}

/**
 * PostgREST `or` filter string for the scope, or null when unfiltered.
 * NULL via_instance = legacy/business → visible to everyone.
 */
export function scopeFilter(scope: MessageScope): string | null {
  if (scope.all) return null;
  const parts: string[] = [];
  const biz = businessAccount().instanceId;
  for (const i of scope.instances) {
    parts.push(`via_instance.eq.${i}`);
    // legacy rows (before stamping) all ran on the default env instance
    if (i === biz) parts.push("via_instance.is.null");
  }
  // nothing matches → impossible predicate
  return parts.length ? parts.join(",") : "id.eq.00000000-0000-0000-0000-000000000000";
}
