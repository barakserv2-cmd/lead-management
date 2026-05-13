"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Service-role admin client (bypasses RLS for the actual write)
function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// 24-hour auto-release window (ms)
const LOCK_TTL_MS = 24 * 60 * 60 * 1000;

export interface ClaimResult {
  success: boolean;
  error?: string;
  assignedTo?: string;
  assignedAt?: string;
  assignedName?: string;
}

async function getCurrentUser(): Promise<{ id: string; name: string } | null> {
  const supa = await createCookieClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;
  // Look up display name from user_profiles, fall back to email
  const { data: profile } = await supa
    .from("user_profiles")
    .select("name, email")
    .eq("id", user.id)
    .maybeSingle();
  const name = profile?.name || profile?.email || user.email || "משתמש";
  return { id: user.id, name };
}

/**
 * Take ownership of a lead. Fails if another coordinator already owns it
 * and the lock is still fresh (within 24h).
 */
export async function claimLead(leadId: string): Promise<ClaimResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "לא מחובר" };

  const admin = getAdmin();

  // Read current lock state
  const { data: lead, error: fetchErr } = await admin
    .from("leads")
    .select("assigned_to, assigned_at")
    .eq("id", leadId)
    .single();

  if (fetchErr || !lead) return { success: false, error: "ליד לא נמצא" };

  const now = Date.now();
  const lockFresh =
    lead.assigned_to &&
    lead.assigned_at &&
    now - new Date(lead.assigned_at).getTime() < LOCK_TTL_MS;

  if (lockFresh && lead.assigned_to !== user.id) {
    // Another coordinator owns it. Look up their name for a useful error.
    const { data: other } = await admin
      .from("user_profiles")
      .select("name")
      .eq("id", lead.assigned_to)
      .maybeSingle();
    return {
      success: false,
      error: `הליד בטיפול של ${other?.name ?? "רכזת אחרת"}`,
    };
  }

  const assignedAt = new Date().toISOString();
  const { error: updErr } = await admin
    .from("leads")
    .update({ assigned_to: user.id, assigned_at: assignedAt })
    .eq("id", leadId);

  if (updErr) return { success: false, error: updErr.message };

  revalidatePath("/leads");
  return {
    success: true,
    assignedTo: user.id,
    assignedAt,
    assignedName: user.name,
  };
}

/**
 * Release a lead back to the general pool. Allowed only by the owner.
 */
export async function releaseLead(leadId: string): Promise<ClaimResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "לא מחובר" };

  const admin = getAdmin();
  const { data: lead } = await admin
    .from("leads")
    .select("assigned_to")
    .eq("id", leadId)
    .single();

  if (lead && lead.assigned_to && lead.assigned_to !== user.id) {
    return { success: false, error: "אי אפשר לשחרר ליד שאינו בטיפול שלך" };
  }

  const { error } = await admin
    .from("leads")
    .update({ assigned_to: null, assigned_at: null })
    .eq("id", leadId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/leads");
  return { success: true };
}
