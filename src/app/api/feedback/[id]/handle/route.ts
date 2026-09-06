import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSupabaseAdmin } from "@/lib/api-auth";

/** POST /api/feedback/[id]/handle — admin marks a report handled (toggle). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const db = getSupabaseAdmin();
  const { data: cur } = await db
    .from("recruiter_feedback")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const handled = cur.status !== "handled";
  const { error } = await db
    .from("recruiter_feedback")
    .update({
      status: handled ? "handled" : "open",
      handled_by: handled ? auth.email : null,
      handled_at: handled ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: handled ? "handled" : "open" });
}
