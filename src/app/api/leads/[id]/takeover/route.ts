import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { setMachineConversationMode } from "@/lib/machineBridge";

/**
 * POST /api/leads/[id]/takeover — a recruiter takes over the conversation from
 * the lead's chat. Raises needs_human_attention so the chat box sends for real
 * instead of simulating, AND actually freezes Gubget: bot_paused + a freeze
 * call to the machine (the old version only set the CRM flag, and Gubget —
 * an external service — kept talking to, and even re-opening, rejected
 * candidates). The recruiter becomes the lead's handler. Reversible via
 * "החזר לגובגט" on the card or "אפשר לגובגט להמשיך" in the escalations tab.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const admin = getSupabaseAdmin();
  const { data: lead } = await admin.from("leads").select("id, phone").eq("id", id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });

  const { error } = await admin
    .from("leads")
    .update({
      needs_human_attention: true,
      human_attention_reason: `${user.email ?? "רכז/ת"} לקח/ה שליטה על השיחה`,
      human_attention_raised_at: new Date().toISOString(),
      bot_paused: true,
      handled_by: user.email ?? undefined,
      handled_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // best-effort: bot_paused is persisted and the machine re-checks it per message
  const frozen = await setMachineConversationMode(lead.phone, "human");

  await admin
    .from("lead_events")
    .insert({
      lead_id: id,
      event_type: "אסקלציה",
      event_text: "רכזת לקחה שליטה מהצ'אט — גובגט מוקפאת",
      created_by: user.email ?? "רכזת",
    })
    .then(() => undefined, () => undefined);

  return NextResponse.json({ ok: true, machineFrozen: frozen });
}
