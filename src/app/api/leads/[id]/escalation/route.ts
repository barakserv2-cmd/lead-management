import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";
import { setMachineConversationMode } from "@/lib/machineBridge";

/**
 * POST /api/leads/[id]/escalation — resolve a Gubget→recruiter escalation.
 *   action="release"  → hand the conversation back to Gubget (mode=bot). Only
 *                       succeeds if the machine confirms it un-froze.
 *   action="takeover" → the recruiter handles it; Gubget stays frozen (human).
 * Either way the human-attention flag is cleared so it leaves the escalations
 * tab, and the action is journaled.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "release" && action !== "takeover") {
    return NextResponse.json({ error: "action must be release|takeover" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: lead } = await db.from("leads").select("id, phone, name").eq("id", id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });

  if (action === "release") {
    // must confirm Gubget actually un-froze before we clear the flag
    const ok = await setMachineConversationMode(lead.phone, "bot");
    if (!ok) {
      return NextResponse.json({ error: "שחרור גובגט נכשל — נסו שוב" }, { status: 502 });
    }
  } else {
    // takeover: keep Gubget frozen (best-effort — it's already in human mode)
    await setMachineConversationMode(lead.phone, "human");
  }

  await db
    .from("leads")
    .update({ needs_human_attention: false, human_attention_reason: null, human_attention_raised_at: null })
    .eq("id", id);

  await db
    .from("lead_events")
    .insert({
      lead_id: id,
      event_type: "אסקלציה",
      event_text: action === "release" ? "שוחרר בחזרה לגובגט — גובגט ממשיך את השיחה" : "רכזת לקחה שליטה — גובגט נשאר מוקפא",
      created_by: user.email ?? "רכזת",
    })
    .then(() => undefined, () => undefined);

  return NextResponse.json({ ok: true });
}
