import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

/**
 * Save a lead's preferences (JSONB: client_preferences, past_issues, …)
 * robustly. Replaces the flaky updateLeadPreferences server action (same Next
 * 16 revalidatePath failure mode that was silently dropping recruiter notes).
 *
 * The write MERGES incoming keys into the current preferences server-side
 * (read-modify-write), so keys the client didn't send are never dropped — even
 * if the client's base copy was stale. Same no-blank guard as notes: an empty
 * value never overwrites a key that currently holds text, so accumulated info
 * ("past_issues", "client_preferences") can't be wiped by an empty save.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;

  let body: { preferences?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const incoming = body.preferences ?? {};

  const { data: lead, error: fetchErr } = await supabase
    .from("leads")
    .select("preferences")
    .eq("id", leadId)
    .single();
  if (fetchErr || !lead) {
    return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });
  }
  const current = (lead.preferences ?? {}) as Record<string, unknown>;

  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(incoming)) {
    // no-blank guard: don't overwrite existing text with an empty value
    const isEmpty = typeof v === "string" && v.trim() === "";
    const currentHasText = typeof current[k] === "string" && (current[k] as string).trim() !== "";
    if (isEmpty && currentHasText) continue;
    merged[k] = v;
  }

  const { error: upErr } = await supabase
    .from("leads")
    .update({ preferences: merged })
    .eq("id", leadId);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await logAudit({ action: "update", leadId, actor: user.email ?? user.id, meta: { fields: ["preferences"] } });

  return NextResponse.json({ ok: true, preferences: merged });
}
