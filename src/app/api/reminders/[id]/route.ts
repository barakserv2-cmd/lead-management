import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { getMessageScope } from "@/lib/messageVisibility";

// DELETE /api/reminders/[id] → cancel a pending reminder (own; admin: any)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await createCookieClient();
  const { data: { user } } = await c.auth.getUser();
  const email = user?.email?.toLowerCase() ?? null;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scope = await getMessageScope(email);

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  let q = admin
    .from("scheduled_messages")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "pending");
  if (!scope.all) q = q.eq("created_by", email);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "התזכורת לא נמצאה או כבר נשלחה" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
