// /api/publishing/settings — the CTA target for every generated post.
// contact_phone is what the wa.me link points at, so it is deliberately NOT
// hardcoded anywhere: the agency sets its own number once, here.

import { NextRequest, NextResponse } from "next/server";
import { admin, bad, currentUser, unauthorized } from "@/lib/publishingAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();

  const db = admin();
  const [{ data, error }, { data: account }] = await Promise.all([
    db.from("publishing_settings").select("*").eq("id", 1).maybeSingle(),
    // The number a post actually carries is the posting recruiter's own — the
    // shared one below is only the fallback for recruiters with none linked.
    db
      .from("whatsapp_accounts")
      .select("phone, label")
      .eq("user_email", user.email)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (error) return bad(error.message, 500);

  return NextResponse.json({
    settings: data,
    my_phone: account?.phone ?? null,
    my_label: account?.label ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const b = (await req.json()) as {
    contact_phone?: string | null;
    contact_name?: string | null;
    signature?: string | null;
  };

  const { data, error } = await admin()
    .from("publishing_settings")
    .update({
      contact_phone: b.contact_phone?.trim() || null,
      contact_name: b.contact_name?.trim() || null,
      signature: b.signature?.trim() || null,
    })
    .eq("id", 1)
    .select()
    .maybeSingle();
  if (error) return bad(error.message, 500);
  return NextResponse.json({ settings: data });
}
