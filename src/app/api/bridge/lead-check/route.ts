import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/phone";

/**
 * GET /api/bridge/lead-check?phone=... — the machine (גובגט) asks, before
 * initiating outreach, whether v1 already owns this candidate. Prevents
 * double-contact / harassment: if a human is on the lead (or it's DNC),
 * גובגט stays quiet. Auth: x-machine-key.
 */

const TERMINAL = ["REJECTED", "LOST_CONTACT", "NOT_SUITABLE", "INVALID_PHONE", "NOT_ACCEPTED", "EMPLOYMENT_ENDED", "NO_SHOW"];
const GUBGET = "gubget@eilatjobs.com";

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-machine-key");
  if (!key || key !== process.env.MACHINE_BRIDGE_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const phone = normalizePhone(req.nextUrl.searchParams.get("phone") ?? "");
  if (!phone) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: lead } = await db
    .from("leads")
    .select("id, status, handled_by, do_not_contact, updated_at")
    .eq("phone", phone)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ exists: false, dnc: false, active: false, humanOwned: false });
  }

  // last human (recruiter) contact
  const { data: lastHuman } = await db
    .from("messages")
    .select("created_at")
    .eq("lead_id", lead.id)
    .eq("role", "recruiter")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastHumanContactDays = lastHuman?.created_at
    ? Math.floor((Date.now() - new Date(lastHuman.created_at).getTime()) / 86400_000)
    : null;

  const active = !TERMINAL.includes(lead.status);
  const humanOwned = !!lead.handled_by && lead.handled_by !== GUBGET;

  return NextResponse.json({
    exists: true,
    dnc: !!lead.do_not_contact,
    active,
    humanOwned,
    status: lead.status,
    lastHumanContactDays,
  });
}
