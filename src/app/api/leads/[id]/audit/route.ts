import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/leads/:id/audit?limit=50 — "מי נגע ברשומה" for the privacy panel.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const limit = Math.min(200, Number(request.nextUrl.searchParams.get("limit") ?? 50) || 50);

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, occurred_at, actor, actor_type, action, changes, meta")
    .eq("lead_id", id)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}
