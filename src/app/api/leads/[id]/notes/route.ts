import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

/**
 * Save a lead's free-text notes robustly.
 *
 * Replaces the `updateLeadNotes` server action, which — as a Next 16 server
 * action doing revalidatePath — is flaky for form POSTs: the implicit RSC
 * refresh can reject the client promise even when (or instead of) the write
 * landing, so recruiters' notes appeared to "vanish". This fetch-based API is
 * the reliable path (same as the journal at /events).
 *
 * Two data-loss guards, because a recruiter losing accumulated notes is the
 * exact complaint this fixes:
 *   1. Empty/whitespace notes NEVER blank an existing non-empty field — that
 *      write is treated as a no-op (the stale/empty-textarea overwrite bug).
 *   2. Every accepted save is journaled to lead_events (append-only), so the
 *      full history survives even as the single `notes` field is overwritten.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;

  let body: { notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const next = (body.notes ?? "").trim();

  // current value — needed for the no-blank guard
  const { data: lead, error: fetchErr } = await supabase
    .from("leads")
    .select("notes")
    .eq("id", leadId)
    .single();
  if (fetchErr || !lead) {
    return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });
  }
  const current = (lead.notes ?? "").trim();

  // Guard 1: refuse to wipe existing notes with an empty save (the race / stale
  // textarea). Return what's really stored so the UI re-syncs to the truth.
  if (!next && current) {
    return NextResponse.json({ ok: true, notes: lead.notes ?? "", skipped: "empty_ignored" });
  }

  // no-op if unchanged
  if (next === current) {
    return NextResponse.json({ ok: true, notes: lead.notes ?? "" });
  }

  const { error: upErr } = await supabase
    .from("leads")
    .update({ notes: next || null })
    .eq("id", leadId);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Guard 2: journal every save so history survives the single-field overwrite.
  if (next) {
    await supabase.from("lead_events").insert({
      lead_id: leadId,
      event_type: "הערה",
      event_text: next,
      created_by: user.email ?? user.id,
    }).then(() => undefined, () => undefined);
  }

  await logAudit({ action: "note", leadId, actor: user.email ?? user.id, meta: { length: next.length } });

  return NextResponse.json({ ok: true, notes: next });
}
