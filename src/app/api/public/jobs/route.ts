import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { isAllowedOrigin } from "@/lib/publicLead";
import { toPublicJobs, type JobRow } from "@/lib/publicJobs";

// המשרות הפתוחות לאתר הציבורי (site/). בלי שם המעסיק ובלי notes (שם יש
// מידע פנימי) — החלטת סער: שם מעסיק מוסתר, שכר מוצג. במטמון 5 דקות ב-CDN.

function cors(origin: string | null): Record<string, string> {
  if (!isAllowedOrigin(origin, process.env.PUBLIC_SITE_ORIGINS)) return {};
  return { "Access-Control-Allow-Origin": origin!, Vary: "Origin" };
}

export async function GET(request: NextRequest) {
  const headers = {
    ...cors(request.headers.get("origin")),
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
  };

  try {
    const db = getSupabaseAdmin();
    const { data: jobs, error } = await db
      .from("jobs")
      .select("title, location, pay_rate, requirements, urgent, client_id")
      .eq("status", "Open")
      .order("urgent", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const clientIds = [...new Set((jobs ?? []).map((j) => j.client_id).filter(Boolean))];
    const { data: clients } = clientIds.length
      ? await db.from("clients").select("id, type").in("id", clientIds)
      : { data: [] as { id: string; type: string | null }[] };
    const typeOf = new Map((clients ?? []).map((c) => [c.id, c.type as string | null]));

    const rows: JobRow[] = (jobs ?? []).map((j) => ({
      title: j.title,
      location: j.location,
      pay_rate: j.pay_rate,
      requirements: j.requirements,
      urgent: j.urgent,
      client_type: j.client_id ? typeOf.get(j.client_id) ?? null : null,
    }));

    return NextResponse.json({ jobs: toPublicJobs(rows) }, { headers });
  } catch (err) {
    console.error("[public/jobs]", err instanceof Error ? err.message : err);
    return NextResponse.json({ jobs: [] }, { status: 500, headers });
  }
}
