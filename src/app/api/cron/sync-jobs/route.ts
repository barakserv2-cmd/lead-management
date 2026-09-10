import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Push v1's OPEN jobs to גובגט so it screens against the real, current set.
// Guarded by CRON_SECRET. Uses MACHINE_INGEST_URL + MACHINE_INGEST_KEY
// (already configured for the leads bridge).

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
  const { data: jobs, error } = await db
    .from("jobs")
    .select("id, title, location, pay_rate, requirements, notes, needed_count, client_id")
    .eq("status", "Open")
    .limit(2000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // employer context per job — gubget should know which client + where, like a recruiter
  const { data: clients } = await db.from("clients").select("id, name, city");
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));

  const mapped = (jobs ?? []).map((j) => {
    const client = j.client_id ? clientMap.get(j.client_id) : null;
    // The jobs.requirements column was being dropped — only `notes` was sent,
    // which is why גובגט never told candidates what a job actually requires
    // (תמי in the survey: דיוק המשרות 1/5, "ללא הסבר מה תנאי המשרה או היקף
    // והדרישות"). Send both, requirements first.
    // A placeholder like "-" or "—" is not a requirement; it read as one in the
    // first pass and reached candidates as a literal dash.
    const meaningful = (s: string) => s.length > 0 && /[\p{L}\p{N}]/u.test(s);
    const reqList = Array.isArray(j.requirements)
      ? (j.requirements as unknown[]).map((r) => String(r).trim()).filter(meaningful)
      : typeof j.requirements === "string" && meaningful(j.requirements.trim())
        ? [j.requirements.trim()]
        : [];
    const notes = (j.notes ?? "").trim();
    const details = [reqList.join(" · "), meaningful(notes) ? notes : ""].filter(Boolean).join(" · ");
    return {
      external_ref: j.id,
      title: j.title,
      city: j.location || client?.city || "לא צוין",
      role_type: j.title,
      // pay_rate is an HOURLY rate ("40", "50-55"). Sending a bare number made
      // גובגט quote it as if it were the whole package.
      salary_range: j.pay_rate ? { min: j.pay_rate, unit: "לשעה" } : {},
      requirements: {
        details,
        needed: j.needed_count ?? null,
        employer: client?.name ?? null,
      },
    };
  });

  try {
    const res = await fetch(`${url}/api/v1/bridge/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-key": key },
      body: JSON.stringify({ jobs: mapped }),
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, pushed: mapped.length, machine: body });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
