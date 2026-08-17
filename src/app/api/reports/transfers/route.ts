// POST /api/reports/transfers  { lead_id, to_client, to_position, transferred_at, reason, apply_to_lead }
// DELETE /api/reports/transfers?id=...
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

  const body = (await req.json().catch(() => ({}))) as {
    lead_id?: string;
    to_client?: string;
    to_position?: string;
    transferred_at?: string;
    reason?: string;
    apply_to_lead?: boolean;
  };
  if (!body.lead_id || !body.to_client?.trim()) {
    return NextResponse.json({ error: "lead_id ומעסיק יעד נדרשים" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: lead } = await admin
    .from("leads")
    .select("hired_client, hired_position, job_title, start_date")
    .eq("id", body.lead_id)
    .maybeSingle();

  const toClient = body.to_client.trim();
  const toPosition = body.to_position?.trim() || null;

  const { data, error } = await admin
    .from("job_transfers")
    .insert({
      lead_id: body.lead_id,
      from_client: lead?.hired_client ?? null,
      from_position: lead?.hired_position ?? lead?.job_title ?? null,
      to_client: toClient,
      to_position: toPosition,
      transferred_at: body.transferred_at || undefined,
      from_start_date: lead?.start_date ?? null,
      to_start_date: body.transferred_at || null,
      reason: body.reason?.trim() || null,
      source: "manual",
      created_by: user.email ?? null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Optionally move the worker on the lead itself. The DB trigger would log a
  // second (auto) row for this update, so we suppress it by updating handled_by
  // first? Simpler: update, then delete the auto row created for this lead
  // within the last few seconds.
  if (body.apply_to_lead !== false) {
    const upd: Record<string, unknown> = { hired_client: toClient };
    if (toPosition) upd.hired_position = toPosition;
    if (body.transferred_at) upd.start_date = body.transferred_at;
    await admin.from("leads").update(upd).eq("id", body.lead_id);
    await admin
      .from("job_transfers")
      .delete()
      .eq("lead_id", body.lead_id)
      .eq("source", "auto")
      .gte("created_at", new Date(Date.now() - 10_000).toISOString());
  }

  return NextResponse.json({ id: data.id });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await getSupabaseAdmin().from("job_transfers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
