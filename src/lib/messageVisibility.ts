// ============================================================
// Message visibility — who may see which WhatsApp conversations.
//
// Conversations on the BUSINESS number (or legacy rows with no instance) are
// shared by everyone. Conversations on a recruiter's PERSONAL number are
// private to that recruiter. Admins (user_profiles.role = 'אדמין') see all.
// ============================================================

import { createClient as createServerClient } from "@supabase/supabase-js";
import { businessAccount, getAccountForEmail } from "@/lib/whatsappService";

const ADMIN_ROLE = "אדמין";

export interface MessageScope {
  /** true → no filtering (admin) */
  all: boolean;
  /** instance ids this user may see (business + own personal) */
  instances: string[];
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
  const biz = businessAccount().instanceId;
  if (!email) return { all: false, instances: [biz] };

  const [{ data: profile }, personal] = await Promise.all([
    admin().from("user_profiles").select("role").ilike("email", email).maybeSingle(),
    getAccountForEmail(email),
  ]);

  if (profile?.role === ADMIN_ROLE) return { all: true, instances: [] };

  const instances = [biz];
  if (personal) instances.push(personal.instanceId);
  return { all: false, instances };
}

/**
 * PostgREST `or` filter string for the scope, or null when unfiltered.
 * NULL via_instance = legacy/business → visible to everyone.
 */
export function scopeFilter(scope: MessageScope): string | null {
  if (scope.all) return null;
  const list = scope.instances.map((i) => `"${i}"`).join(",");
  return `via_instance.is.null,via_instance.in.(${list})`;
}
