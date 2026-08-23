import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { getMessageScope } from "@/lib/messageVisibility";

// GET  /api/leads/[id]/reminders → reminders for this lead (mine; admin: all)
// POST /api/leads/[id]/reminders → schedule one { sendAt: ISO, message }

function admin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function me() {
  const c = await createCookieClient();
  const { data: { user } } = await c.auth.getUser();
  return user?.email?.toLowerCase() ?? null;
}

const COLS = "id, send_at, message, created_by, status, sent_at, error, created_at";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const email = await me();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scope = await getMessageScope(email);

  let q = admin()
    .from("scheduled_messages")
    .select(COLS)
    .eq("lead_id", id)
    .order("send_at", { ascending: true });
  if (!scope.all) q = q.eq("created_by", email);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminders: data ?? [], canSend: scope.canSend });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const email = await me();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scope = await getMessageScope(email);
  if (!scope.canSend) {
    return NextResponse.json(
      { error: "אין לך מספר וואטסאפ מחובר — אי אפשר לקבוע תזכורות" },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { sendAt?: string; message?: string };
  const sendAt = body.sendAt ? new Date(body.sendAt) : null;
  const message = body.message?.trim() ?? "";
  if (!sendAt || Number.isNaN(sendAt.getTime())) {
    return NextResponse.json({ error: "תאריך/שעה לא תקינים" }, { status: 400 });
  }
  if (sendAt.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "הזמן שנבחר כבר עבר" }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: "חסר טקסט להודעה" }, { status: 400 });

  const { data: lead } = await admin().from("leads").select("id, phone").eq("id", id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "ליד לא נמצא" }, { status: 404 });
  if (!lead.phone) return NextResponse.json({ error: "לליד אין מספר טלפון" }, { status: 400 });

  const { data, error } = await admin()
    .from("scheduled_messages")
    .insert({ lead_id: id, send_at: sendAt.toISOString(), message, created_by: email })
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminder: data });
}
