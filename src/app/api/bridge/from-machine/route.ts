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
};

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

  return NextResponse.json({ ok: true, leadId, appended, statusChanged }, { status: 200 });
}
