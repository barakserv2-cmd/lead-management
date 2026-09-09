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
  // interview_date הוא שעון קיר ישראלי עם תווית UTC — גבולות היום באותה מסגרת.
  // שתי שאילתות: מי שהראיון שלו ביום זה, ומי שדחה הגעה והמועד המקורי שלו ביום
  // זה (postponed_from_date) — כך מועמד דחוי מופיע גם ביום המקורי וגם בחדש.
  const [{ data: byInterview, error: e1 }, { data: byPostponed, error: e2 }] = await Promise.all([
    db
      .from("leads")
      .select(INTERVIEW_REPORT_SELECT)
      .gte("interview_date", `${date}T00:00:00Z`)
      .lte("interview_date", `${date}T23:59:59Z`)
      .order("interview_date", { ascending: true })
      .limit(1000),
    db
      .from("leads")
      .select(INTERVIEW_REPORT_SELECT)
      .not("postponed_from_date", "is", null)
      .gte("postponed_from_date", `${date}T00:00:00Z`)
      .lte("postponed_from_date", `${date}T23:59:59Z`)
      .limit(1000),
  ]);
  if (e1 || e2) return NextResponse.json({ error: (e1 ?? e2)!.message }, { status: 500 });

  let rows = [
    ...((byInterview ?? []) as Record<string, unknown>[]).map(leadToReportRow),
    // original-date rows: render the postpone on its FIRST-appointment day
    ...((byPostponed ?? []) as Record<string, unknown>[]).map((l) =>
      leadToReportRow({ ...l, interview_date: l.postponed_from_date, status: "POSTPONED_ARRIVAL" })
    ),
  ];
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
