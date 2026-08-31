import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthedUser, getSupabaseAdmin, requireAdmin } from "@/lib/api-auth";
import { anonymizeLead, exportLeadData, hardDeleteLead } from "@/lib/privacy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── בקשות נושא מידע (DSAR) ────────────────────────────────
//   GET    /api/leads/:id/privacy            → זכות עיון: כל המידע על המועמד (JSON להורדה) · אדמין
//   DELETE /api/leads/:id/privacy            → זכות מחיקה: אנונימיזציה (ברירת מחדל) · אדמין
//   DELETE /api/leads/:id/privacy?mode=hard  → מחיקה מלאה של הרשומה · אדמין
//   POST   /api/leads/:id/privacy            → הפעלה/ביטול של do_not_contact · כל רכזת מחוברת
// ייצוא ומחיקה הם פעולות בלתי-הפיכות/רגישות — אדמין בלבד (שלב 2 בתוכנית).
// כל פעולה נרשמת ב-audit_log.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const user = auth;

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
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const user = auth;

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

// הפעלה/ביטול של "לא ליצור קשר" — פעולה הפיכה, פתוחה לכל רכזת מחוברת
// (רכזת שמדברת עם מועמד שמבקש הסרה חייבת לסמן במקום). נרשם ב-audit
// וביומן האירועים של הליד.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  const { id } = await params;
  let body: { do_not_contact?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.do_not_contact !== "boolean") {
    return NextResponse.json({ error: "חסר do_not_contact (boolean)" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: updated, error } = await admin
    .from("leads")
    .update({ do_not_contact: body.do_not_contact })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "ליד לא נמצא" }, { status: 404 });

  await admin.from("lead_events").insert({
    lead_id: id,
    event_type: "פרטיות",
    event_text: body.do_not_contact
      ? "סומן 'לא ליצור קשר' — כל שליחת וואטסאפ נחסמת"
      : "בוטל 'לא ליצור קשר' — שליחת הודעות התאפשרה מחדש",
    created_by: user.email,
  });

  await logAudit({
    action: "update",
    leadId: id,
    actor: user.email,
    request,
    meta: { field: "do_not_contact", to: body.do_not_contact, via: "POST /api/leads/[id]/privacy" },
  });

  return NextResponse.json({ ok: true, do_not_contact: body.do_not_contact });
}
