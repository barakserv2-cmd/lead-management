import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getSupabaseAdmin, requireAdmin } from "@/lib/api-auth";

// ── ניהול מנוע החוקים ──────────────────────────────────────
//   GET   → רשימת החוקים + מוני ריצות (כל רכזת מחוברת)
//   PATCH → הפעלה/כיבוי של חוק (אדמין בלבד — הדלקה שולחת הודעות)

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const [{ data: rules, error }, { data: runs }] = await Promise.all([
    admin
      .from("automation_rules")
      .select("id, name, description, enabled, trigger_type, params, action_type, template, sort_order")
      .order("sort_order"),
    admin
      .from("automation_runs")
      .select("rule_id, success, created_at")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString()),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stats = new Map<string, { ok: number; failed: number; last: string | null }>();
  for (const r of runs ?? []) {
    const s = stats.get(String(r.rule_id)) ?? { ok: 0, failed: 0, last: null };
    if (r.success) s.ok++;
    else s.failed++;
    if (!s.last || String(r.created_at) > s.last) s.last = String(r.created_at);
    stats.set(String(r.rule_id), s);
  }

  return NextResponse.json({
    rules: (rules ?? []).map((r) => ({
      ...r,
      week_ok: stats.get(String(r.id))?.ok ?? 0,
      week_failed: stats.get(String(r.id))?.failed ?? 0,
      last_run: stats.get(String(r.id))?.last ?? null,
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: { id?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "חסר id / enabled" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("automation_rules")
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq("id", body.id)
    .select("id, name, enabled")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "חוק לא נמצא" }, { status: 404 });

  return NextResponse.json({ ok: true, rule: data });
}
