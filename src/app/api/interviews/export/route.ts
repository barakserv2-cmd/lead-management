// ============================================================
// GET /api/interviews/export?date=YYYY-MM-DD[&client=..]
// Styled XLSX "דוח ראיונות" for one day (office template layout).
// Requires a logged-in dashboard user.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { buildInterviewsWorkbook, fmtReportDate } from "@/lib/reports/interviewsXlsx";
import { INTERVIEW_REPORT_SELECT, leadToReportRow } from "@/lib/reports/interviewsReportRow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "חסר פרמטר date בפורמט YYYY-MM-DD" }, { status: 400 });
  }
  const clientFilter = req.nextUrl.searchParams.get("client")?.trim();

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("leads")
    .select(INTERVIEW_REPORT_SELECT)
    .gte("interview_date", `${date}T00:00:00+03:00`)
    .lte("interview_date", `${date}T23:59:59+03:00`)
    .order("interview_date", { ascending: true })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = ((data ?? []) as Record<string, unknown>[]).map(leadToReportRow);
  if (clientFilter) rows = rows.filter((r) => (r.accepted_to ?? "").includes(clientFilter));

  const buf = await buildInterviewsWorkbook(date, rows);
  const filename = encodeURIComponent(`דוח ראיונות ${fmtReportDate(date)}.xlsx`);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
