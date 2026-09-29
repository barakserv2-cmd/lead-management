import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { isAllowedOrigin } from "@/lib/publicLead";

// המשרות הפתוחות לאתר הציבורי (site/). רק שדות שמותר לפרסם: בלי שם
// המעסיק ובלי notes (שם יש מידע פנימי). נשמר במטמון 5 דקות ב-CDN.

const CLIENT_TYPE_LABEL: Record<string, string> = {
  Hotel: "מלונאות",
  Restaurant: "מסעדנות",
  Construction: "בנייה",
  Other: "אחר",
};

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
      .select("id, title, location, pay_rate, requirements, urgent, client_id, created_at")
      .eq("status", "Open")
      .order("urgent", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    const clientIds = [...new Set((jobs ?? []).map((j) => j.client_id).filter(Boolean))];
    const { data: clients } = clientIds.length
      ? await db.from("clients").select("id, type").in("id", clientIds)
      : { data: [] as { id: string; type: string | null }[] };
    const typeOf = new Map((clients ?? []).map((c) => [c.id, c.type as string | null]));

    const out = (jobs ?? []).map((j) => ({
      id: j.id,
      title: j.title,
      location: j.location || "אילת",
      pay: j.pay_rate || null,
      requirements: (j.requirements ?? []).slice(0, 4),
      urgent: !!j.urgent,
      sector: CLIENT_TYPE_LABEL[typeOf.get(j.client_id) ?? ""] ?? null,
      posted: j.created_at,
    }));

    return NextResponse.json({ jobs: out }, { headers });
  } catch (err) {
    console.error("[public/jobs]", err instanceof Error ? err.message : err);
    return NextResponse.json({ jobs: [] }, { status: 500, headers });
  }
}
