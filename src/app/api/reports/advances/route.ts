// POST /api/reports/advances  { lead_id, amount, paid_at, notes }
// DELETE /api/reports/advances?id=...
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { lead_id?: string; amount?: number | string; paid_at?: string; notes?: string };
  const amount = Number(body.amount);
  if (!body.lead_id || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "lead_id ו-amount חיובי נדרשים" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: lead } = await admin.from("leads").select("hired_client").eq("id", body.lead_id).maybeSingle();

  const { data, error } = await admin
    .from("advances")
    .insert({
      lead_id: body.lead_id,
      amount,
      paid_at: body.paid_at || undefined,
      employer: lead?.hired_client ?? null,
      notes: body.notes?.trim() || null,
      created_by: user.email ?? null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await getSupabaseAdmin().from("advances").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
