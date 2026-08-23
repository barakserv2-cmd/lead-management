// ============================================================
// Message visibility — who may see which WhatsApp conversations.
//
// Every WhatsApp number belongs to one recruiter (whatsapp_accounts). A
// recruiter sees only conversations on their own number, plus messages they
// personally sent (even when they went out via the fallback number because
// they have no number linked yet). Legacy rows with no instance stamp belong
// to the default env instance. Admins (user_profiles.role = 'אדמין') see all.
// ============================================================

import { createClient as createServerClient } from "@supabase/supabase-js";
import { businessAccount, getAccountForEmail } from "@/lib/whatsappService";

const ADMIN_ROLE = "אדמין";

export interface MessageScope {
  /** true → no filtering (admin) */
  all: boolean;
  /** instance ids this user owns */
  instances: string[];
  /** the user's email — messages they sent are always visible to them */
  email: string | null;
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
  if (!email) return { all: false, instances: [], email: null };
  const lower = email.toLowerCase();

  const [{ data: profile }, personal] = await Promise.all([
    admin().from("user_profiles").select("role").ilike("email", lower).maybeSingle(),
    getAccountForEmail(lower),
  ]);

  if (profile?.role === ADMIN_ROLE) return { all: true, instances: [], email: lower };

  return { all: false, instances: personal ? [personal.instanceId] : [], email: lower };
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
  if (scope.email) parts.push(`sent_by.eq.${scope.email}`);
  // nothing matches → impossible predicate
  return parts.length ? parts.join(",") : "id.eq.00000000-0000-0000-0000-000000000000";
}
