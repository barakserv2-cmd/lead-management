import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/phone";
import { isValidStatus, STATUS_LABELS, type LeadStatusValue } from "@/lib/stateMachine";

/**
 * POST /api/bridge/from-machine — the autonomous machine ("גובגט") reports
 * what it did, exactly like a recruiter updating the CRM. One-way IN to v1:
 * upsert the lead, append conversation messages, and move the status —
 * attributed to גובגט (handled_by = gubget@eilatjobs.com).
 *
 * Auth: shared secret in x-machine-key (MACHINE_BRIDGE_KEY). This is the
 * reverse of the v1→machine bridge; v1 stays in control of its own writes.
 */

const GUBGET_EMAIL = "gubget@eilatjobs.com";

type InMsg = { role?: string; content?: string; created_at?: string };
type Body = {
  phone?: string;
  name?: string;
  source?: string;
  status?: string; // a v1 LeadStatus code
  messages?: InMsg[];
  escalation?: { reason?: string } | null; // raise the human-attention flag
  note?: string; // a distilled recruiter-style note → lead_events
  // interview booked through גובגט — naive Israel wall-clock "YYYY-MM-DDTHH:mm"
  // (no Z), the same convention v1's own self-booking writes. Without this the
  // lead never lands on the ראיונות board and is lost.
  interviewAt?: string;
  interviewType?: "phone" | "in_person" | "video";
};

// accept exactly the naive wall-clock shape v1 stores (YYYY-MM-DDTHH:mm[:ss])
const INTERVIEW_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-machine-key");
  if (!key || key !== process.env.MACHINE_BRIDGE_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });

  const db = getSupabaseAdmin();

  // 1. Upsert the lead by phone
  const { data: existing } = await db
    .from("leads")
    .select("id, name, status, handled_by")
    .eq("phone", phone)
    .maybeSingle();

  let leadId: string;
  let currentStatus: string | null = null;

  if (existing) {
    leadId = existing.id;
    currentStatus = existing.status;
    const patch: Record<string, unknown> = {};
    if (body.name && !existing.name) patch.name = body.name;
    // claim as גובגט only when no human already owns it
    if (!existing.handled_by) patch.handled_by = GUBGET_EMAIL;
    if (Object.keys(patch).length > 0) {
      await db.from("leads").update(patch).eq("id", leadId);
    }
  } else {
    const { data: created, error } = await db
      .from("leads")
      .insert({
        name: body.name ?? "",
        phone,
        source: body.source ?? "גובגט",
        status: "NEW_LEAD",
        handled_by: GUBGET_EMAIL,
      })
      .select("id, status")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: "create_failed", detail: error?.message }, { status: 500 });
    }
    leadId = created.id;
    currentStatus = created.status;
  }

  // 2. Append conversation messages (dedup on identical content already stored)
  let appended = 0;
  for (const m of body.messages ?? []) {
    const content = (m.content ?? "").trim();
    if (!content) continue;
    const role = m.role === "user" ? "user" : "assistant";
    const { data: dupe } = await db
      .from("messages")
      .select("id")
      .eq("lead_id", leadId)
      .eq("content", content)
      .limit(1)
      .maybeSingle();
    if (dupe) continue;
    await db.from("messages").insert({
      lead_id: leadId,
      role,
      content,
      ...(m.created_at && !isNaN(Date.parse(m.created_at)) ? { created_at: new Date(m.created_at).toISOString() } : {}),
    });
    appended++;
  }

  // 3. Move status (validateTransition currently gates on validity only)
  let statusChanged = false;
  if (body.status && isValidStatus(body.status) && body.status !== currentStatus) {
    const target = body.status as LeadStatusValue;
    const { error: upErr } = await db.from("leads").update({ status: target }).eq("id", leadId);
    if (!upErr) {
      statusChanged = true;
      await db.from("lead_status_history").insert({
        lead_id: leadId,
        from_status: isValidStatus(currentStatus ?? "") ? currentStatus : null,
        to_status: target,
        changed_by: GUBGET_EMAIL,
        notes: `עדכון אוטומטי מגובגט (${STATUS_LABELS[target] ?? target})`,
      });
    }
  }

  // 3b. Interview date — write it whenever גובגט booked a slot, so the lead
  //     appears on the ראיונות board (which requires interview_date IS NOT
  //     NULL). Stored naive, exactly as v1's own self-booking does.
  let interviewSet = false;
  if (body.interviewAt && INTERVIEW_AT_RE.test(body.interviewAt)) {
    const patch: Record<string, unknown> = { interview_date: body.interviewAt };
    if (body.interviewType) patch.interview_type = body.interviewType;
    const { error: ivErr } = await db.from("leads").update(patch).eq("id", leadId);
    if (!ivErr) interviewSet = true;
  }

  // 4. Human-attention flag — surfaces a red banner on the lead so recruiters
  //    (not just an admin phone) see they need to step in.
  let escalated = false;
  if (body.escalation && body.escalation.reason) {
    const { error: attErr } = await db
      .from("leads")
      .update({
        needs_human_attention: true,
        human_attention_reason: body.escalation.reason,
        human_attention_raised_at: new Date().toISOString(),
      })
      .eq("id", leadId);
    if (!attErr) escalated = true;
  }

  // 5. Distilled recruiter-style note → the lead's event log, so a recruiter
  //    sees the key facts at a glance without reading the whole chat.
  let noted = false;
  if (body.note && body.note.trim()) {
    const { error: nErr } = await db.from("lead_events").insert({
      lead_id: leadId,
      event_type: "גובגט",
      event_text: body.note.trim().slice(0, 1000),
      created_by: GUBGET_EMAIL,
    });
    if (!nErr) noted = true;
  }

  return NextResponse.json({ ok: true, leadId, appended, statusChanged, interviewSet, escalated, noted }, { status: 200 });
}
