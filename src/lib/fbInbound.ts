// ============================================================
// Facebook-group replies → CRM leads.
//
// Every post published through /publishing carries a wa.me link whose
// prefilled text ends with a unique code (BK-XXXX). When the candidate hits
// send, that code arrives in the recruiter's WhatsApp — which is the only
// evidence we get that this person came from a specific group post.
//
// The code is also the safety gate: the recruiter's number is her personal
// one, so a message WITHOUT a code is left alone (the webhook keeps ignoring
// unknown senders). Only a valid code opens a lead.
// ============================================================

import { createClient as createServerClient } from "@supabase/supabase-js";
import { extractTrackingCode } from "@/lib/publishing";
import { LeadStatus } from "@/lib/stateMachine";

function admin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface MatchedPublication {
  id: string;
  tracking_code: string;
  owner_email: string | null;
  group_name: string | null;
  post_title: string | null;
  role_label: string | null;
}

/** Finds the publication a message's BK-XXXX code belongs to, if any. */
export async function matchPublication(text: string): Promise<MatchedPublication | null> {
  const code = extractTrackingCode(text);
  if (!code) return null;

  const { data } = await admin()
    .from("fb_publications")
    .select("id, tracking_code, owner_email, fb_groups(name), fb_posts(title, role_key)")
    .eq("tracking_code", code)
    .maybeSingle();
  if (!data) return null;

  const group = (data as { fb_groups?: { name?: string } | null }).fb_groups;
  const post = (data as { fb_posts?: { title?: string; role_key?: string } | null }).fb_posts;

  let roleLabel: string | null = null;
  if (post?.role_key) {
    const { data: role } = await admin()
      .from("fb_role_templates")
      .select("role_label")
      .eq("role_key", post.role_key)
      .maybeSingle();
    roleLabel = role?.role_label ?? null;
  }

  return {
    id: data.id as string,
    tracking_code: data.tracking_code as string,
    owner_email: (data.owner_email as string | null) ?? null,
    group_name: group?.name ?? null,
    post_title: post?.title ?? null,
    role_label: roleLabel,
  };
}

/**
 * Source tag for a group lead. Campaign-level on purpose: "פייסבוק" alone
 * would make every group look identical in the reports, which is exactly the
 * question this module exists to answer.
 */
export function sourceForGroup(groupName: string | null): string {
  return groupName ? `פייסבוק אורגני - ${groupName}` : "פייסבוק אורגני";
}

/**
 * Opens a lead for someone who answered a group post. Returns the lead id, or
 * null if it could not be created. Handles the phone-uniqueness trigger
 * (00047/00048): a racing insert means the lead already exists, so we read it
 * back instead of failing.
 */
export async function createLeadFromPublication(
  phone: string,
  senderName: string | null,
  pub: MatchedPublication
): Promise<string | null> {
  const db = admin();

  const { data, error } = await db
    .from("leads")
    .insert({
      name: senderName?.trim() || "פונה מפייסבוק",
      phone,
      source: sourceForGroup(pub.group_name),
      status: LeadStatus.NEW_LEAD,
      job_title: pub.role_label ?? pub.post_title ?? null,
      fb_publication_id: pub.id,
      notes: `הגיע/ה מפוסט בקבוצה "${pub.group_name ?? "לא ידוע"}" (קוד ${pub.tracking_code})`,
    })
    .select("id")
    .single();

  if (!error) return data.id as string;

  // 23505 = the phone already belongs to a candidate; use that one.
  if (error.code === "23505") {
    const { data: existing } = await db
      .from("leads")
      .select("id")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (existing?.id as string) ?? null;
  }

  console.error("[fbInbound] lead insert failed:", error.message);
  return null;
}

/**
 * Records that this publication produced a reply, and links the lead to it.
 * Counted once per lead: the same candidate sending three messages is one
 * response, otherwise the per-group numbers reward chattiness.
 */
export async function recordResponse(leadId: string, pub: MatchedPublication): Promise<void> {
  const db = admin();

  const { data: lead } = await db
    .from("leads")
    .select("fb_publication_id")
    .eq("id", leadId)
    .maybeSingle();

  if (lead?.fb_publication_id === pub.id) return; // already counted

  await db.from("leads").update({ fb_publication_id: pub.id }).eq("id", leadId);
  await db.rpc("increment_publication_responses", { p_id: pub.id });
}
