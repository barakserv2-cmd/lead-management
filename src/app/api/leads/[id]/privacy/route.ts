import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { anonymizeLead, exportLeadData, hardDeleteLead } from "@/lib/privacy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── בקשות נושא מידע (DSAR) ────────────────────────────────
//   GET    /api/leads/:id/privacy            → זכות עיון: כל המידע על המועמד (JSON להורדה)
//   DELETE /api/leads/:id/privacy            → זכות מחיקה: אנונימיזציה (ברירת מחדל)
//   DELETE /api/leads/:id/privacy?mode=hard  → מחיקה מלאה של הרשומה
// דורש session של רכז/ת. כל פעולה נרשמת ב-audit_log.

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await exportLeadData(id);
  if (!data) return NextResponse.json({ error: "ליד לא נמצא" }, { status: 404 });

  await logAudit({
    action: "export",
    leadId: id,
    actor: user.email,
    request,
    meta: { via: "GET /api/leads/[id]/privacy", tables: Object.keys(data.related) },
  });

  const filename = `lead-${id.slice(0, 8)}-data-export.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const mode = request.nextUrl.searchParams.get("mode") === "hard" ? "hard" : "anonymize";
  const reason =
    request.nextUrl.searchParams.get("reason")?.slice(0, 200) || "בקשת מועמד/ת";
  const actor = user.email ?? "user";

  const result =
    mode === "hard"
      ? await hardDeleteLead(id, actor, reason)
      : await anonymizeLead(id, actor, { reason });

  if (!result.ok) {
    const status = result.error === "lead not found" ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, mode });
}
