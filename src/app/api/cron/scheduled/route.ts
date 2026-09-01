import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import {
  sendWhatsAppMessage,
  resolveSender,
  getInstanceState,
  businessAccount,
  type WhatsAppAccount,
  type InstanceState,
} from "@/lib/whatsappService";
import { runWelcomeBatch } from "@/lib/whatsappWelcome";

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

  // ── שלב 1: ניטור מצב ה-instances מול GreenAPI ──────────────
  // yellowCard = אזהרה לפני חסימה; blocked/notAuthorized = המספר נפל.
  // מספר בסבב הבוט שנפגע — יוצא מהסבב אוטומטית + התראה בוואטסאפ לאדמין.
  let monitored = 0;
  try {
    monitored = await monitorInstances(db);
  } catch (e) {
    console.error("[cron/scheduled] instance monitor failed:", e);
  }

  // ── שלב 1: ריקון תור הודעות הפתיחה (לידים שחיכו למכסה/בוקר) ──
  let welcome = { sent: 0, pending: 0 };
  try {
    welcome = await runWelcomeBatch();
  } catch (e) {
    console.error("[cron/scheduled] welcome batch failed:", e);
  }

  return NextResponse.json({
    ok: true,
    due: due?.length ?? 0,
    sent,
    failed,
    monitored,
    welcome,
  });
}

const BAD_STATES: InstanceState[] = ["yellowCard", "blocked", "notAuthorized"];

async function monitorInstances(db: ReturnType<typeof admin>): Promise<number> {
  const { data: accounts } = await db
    .from("whatsapp_accounts")
    .select("instance_id, api_token, label, is_active, bot_enabled, last_state")
    .eq("is_active", true);

  let checked = 0;
  for (const a of accounts ?? []) {
    const acc: WhatsAppAccount = {
      instanceId: String(a.instance_id),
      token: String(a.api_token),
      label: (a.label as string) ?? null,
    };
    let state: InstanceState = "unknown";
    try {
      state = await getInstanceState(acc);
    } catch {
      state = "unknown";
    }
    checked++;

    await db
      .from("whatsapp_accounts")
      .update({ last_state: state, state_checked_at: new Date().toISOString() })
      .eq("instance_id", acc.instanceId);

    const wentBad =
      BAD_STATES.includes(state) && a.last_state !== state; // התראה רק על שינוי
    if (!wentBad) continue;

    if (a.bot_enabled) {
      await db
        .from("whatsapp_accounts")
        .update({ bot_enabled: false })
        .eq("instance_id", acc.instanceId);
    }

    const adminPhone = (process.env.ADMIN_ALERT_PHONE ?? "0547000992").trim();
    const alertMsg =
      `⚠️ התראת וואטסאפ — ${a.label ?? acc.instanceId}\n` +
      `המספר עבר למצב: ${state}\n` +
      (a.bot_enabled ? "הוצא אוטומטית מסבב הבוט. " : "") +
      `בדוק את ה-instance בקונסולת GreenAPI.`;

    // שולחים את ההתראה מכל מספר תקין אחר (או המספר העסקי)
    const others = (accounts ?? []).filter(
      (o) => String(o.instance_id) !== acc.instanceId && !BAD_STATES.includes(o.last_state as InstanceState)
    );
    const alertSender: WhatsAppAccount = others.length
      ? { instanceId: String(others[0].instance_id), token: String(others[0].api_token) }
      : businessAccount();
    const res = await sendWhatsAppMessage(adminPhone, alertMsg, alertSender, { skipGate: true });
    if (!res.success) {
      console.error(`[cron/scheduled] admin alert failed for ${acc.instanceId}:`, res.error);
    }
  }
  return checked;
}
