import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone, isPhoneUniqueViolation, DUPLICATE_PHONE_MESSAGE } from "@/lib/phone";

export type ExistingLead = { id: string; name: string | null; phone: string | null; status: string | null };

/**
 * Server-side pre-check: does another lead already own this phone?
 * Returns the owner (excluding `excludeId`) or null. The DB trigger + unique
 * index (migration 00047) are the real guarantee; this exists to give a
 * useful 409 with a link to the existing card.
 */
export async function findLeadByPhone(
  supabase: SupabaseClient,
  phone: string | null | undefined,
  excludeId?: string
): Promise<ExistingLead | null> {
  const norm = normalizePhone(phone);
  if (!norm || /^(no-phone-|anon-)/.test(norm)) return null;
  let q = supabase.from("leads").select("id, name, phone, status").eq("phone", norm).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.maybeSingle();
  return (data as ExistingLead | null) ?? null;
}

/** Standard 409 payload for a duplicate phone. */
export function duplicatePhonePayload(existing: ExistingLead) {
  return {
    error: DUPLICATE_PHONE_MESSAGE,
    code: "DUPLICATE_PHONE" as const,
    existing: { id: existing.id, name: existing.name, phone: existing.phone, status: existing.status },
  };
}

export { isPhoneUniqueViolation, DUPLICATE_PHONE_MESSAGE };
