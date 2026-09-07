import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Push EVERY new lead (any source) to גובגט so it's the first responder — not
// just AllJobs-email leads. Runs every minute; גובגט de-dups (R-102), so a
// lead pushed more than once only ever gets one welcome. Guarded by CRON_SECRET.

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = process.env.MACHINE_INGEST_URL;
  const key = process.env.MACHINE_INGEST_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "machine bridge not configured" });

  const db = getAdmin();
  const since = new Date(Date.now() - 3 * 60_000).toISOString(); // last 3 min (overlap is harmless — גובגט de-dups)
  const { data: leads, error } = await db
    .from("leads")
    .select("phone, name, location, source, job_title, handled_by")
    .gte("created_at", since)
    .limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let pushed = 0;
  for (const l of leads ?? []) {
    if (!l.phone) continue;
    if (l.source === "גובגט" || l.handled_by === "gubget@eilatjobs.com") continue; // don't echo גובגט's own leads back
    try {
      await fetch(`${url}/api/v1/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ingest-key": key },
        body: JSON.stringify({
          phone: l.phone,
          name: l.name ?? undefined,
          city: l.location ?? undefined,
          source_key: "lead_management_bridge",
          campaign: l.source ?? undefined,
          job_hint: l.job_title ?? undefined,
        }),
      });
      pushed++;
    } catch {
      // best-effort; never break — next run retries (window overlaps)
    }
  }
  return NextResponse.json({ ok: true, considered: leads?.length ?? 0, pushed });
}
