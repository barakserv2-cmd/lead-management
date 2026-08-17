// ============================================================
// Assistant CSV export
// GET /api/assistant/export?type=leads|hired&statuses=A,B&source=..&from=..&to=..&client=..&job=..
// Streams a UTF-8 (BOM) CSV that opens cleanly in Excel with Hebrew.
// Requires a logged-in dashboard user.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { STATUS_LABELS, LeadStatus, ALL_STATUSES, type LeadStatusValue } from "@/lib/stateMachine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join(" | ") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const BOM = String.fromCharCode(0xfeff);
  return BOM + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", hour12: false });
}

export async function GET(req: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") === "hired" ? "hired" : "leads";
  const from = sp.get("from");
  const to = sp.get("to");

  const db = admin();
  let q = db
    .from("leads")
    .select(
      "id, created_at, name, phone, email, job_title, location, experience, age, source, status, sub_status, hired_client, hired_position, start_date, interview_date, rejection_reason, notes, tags, preferences"
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  if (type === "hired") {
    q = q.in("status", [LeadStatus.HIRED, LeadStatus.STARTED]);
  } else {
    const statuses = (sp.get("statuses") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is LeadStatusValue => (ALL_STATUSES as string[]).includes(s));
    if (statuses.length) q = q.in("status", statuses);
    const source = sp.get("source");
    if (source) q = q.eq("source", source);
    const job = sp.get("job");
    if (job) q = q.ilike("job_title", `%${job}%`);
  }
  if (from) q = q.gte("created_at", `${from}T00:00:00`);
  if (to) q = q.lte("created_at", `${to}T23:59:59`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];
  const clientFilter = sp.get("client")?.trim();
  if (type === "hired" && clientFilter) {
    rows = rows.filter((l) => {
      const matched = (l.preferences as Record<string, unknown> | null)?.matched_client;
      const c = l.hired_client ?? (typeof matched === "string" ? matched : "");
      return (c ?? "").includes(clientFilter);
    });
  }

  let csv: string;
  let filename: string;
  const stamp = new Date().toISOString().slice(0, 10);

  if (type === "hired") {
    csv = toCsv(
      ["שם", "טלפון", "מעסיק", "תפקיד", "תאריך התחלה", "סטטוס", "נוצר בתאריך", "גורם גיוס"],
      rows.map((l) => {
        const matched = (l.preferences as Record<string, unknown> | null)?.matched_client;
        return [
          l.name,
          l.phone,
          l.hired_client ?? (typeof matched === "string" ? matched : ""),
          l.hired_position ?? l.job_title,
          l.start_date,
          STATUS_LABELS[l.status as LeadStatusValue] ?? l.status,
          fmtDate(l.created_at),
          l.source,
        ];
      })
    );
    filename = `hired-report-${stamp}.csv`;
  } else {
    csv = toCsv(
      ["שם", "טלפון", "אימייל", "תפקיד מבוקש", "מיקום", "ניסיון", "גיל", "גורם גיוס", "סטטוס", "תת-סטטוס", "תאריך ראיון", "מעסיק", "סיבת דחייה", "תגיות", "הערות", "נוצר בתאריך"],
      rows.map((l) => [
        l.name,
        l.phone,
        l.email,
        l.job_title,
        l.location,
        l.experience,
        l.age,
        l.source,
        STATUS_LABELS[l.status as LeadStatusValue] ?? l.status,
        l.sub_status,
        fmtDate(l.interview_date),
        l.hired_client,
        l.rejection_reason,
        l.tags,
        l.notes,
        fmtDate(l.created_at),
      ])
    );
    filename = `leads-export-${stamp}.csv`;
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
