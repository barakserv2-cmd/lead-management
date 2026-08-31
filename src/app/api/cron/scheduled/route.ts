import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage, resolveSender } from "@/lib/whatsappService";

// ============================================================
// /api/cron/scheduled — every 5 minutes (vercel.json).
// Sends recruiter-scheduled reminders whose time has come, from the
// scheduling recruiter's own WhatsApp number, and logs them to the chat.
// ============================================================

function admin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = admin();
  const { data: due, error } = await db
    .from("scheduled_messages")
    .select("id, lead_id, message, created_by, leads(phone, name)")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .order("send_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const row of due ?? []) {
    const lead = (Array.isArray(row.leads) ? row.leads[0] : row.leads) as
      | { phone: string | null; name: string | null }
      | null;

    // Claim the row first so two overlapping runs can't double-send.
    const { data: claimed } = await db
      .from("scheduled_messages")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    if (!lead?.phone) {
      await db
        .from("scheduled_messages")
        .update({ status: "failed", error: "לליד אין טלפון" })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const sender = await resolveSender(row.created_by);
    const res = await sendWhatsAppMessage(lead.phone, row.message, sender, { automated: true });
    if (res.success) {
      sent++;
      await db.from("messages").insert({
        lead_id: row.lead_id,
        role: "recruiter",
        content: row.message,
        sent_by: row.created_by,
        via_instance: sender.instanceId,
      });
    } else {
      failed++;
      await db
        .from("scheduled_messages")
        .update({ status: "failed", error: res.error ?? "send failed" })
        .eq("id", row.id);
      console.error(`[cron/scheduled] send failed for ${row.id}:`, res.error);
    }
  }

  return NextResponse.json({ ok: true, due: due?.length ?? 0, sent, failed });
}
