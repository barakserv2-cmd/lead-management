import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import {
  sendWhatsAppMessage,
  resolveSender,
  getInstanceState,
  getAccountByInstance,
  type WhatsAppAccount,
  type InstanceState,
} from "@/lib/whatsappService";
import { runWelcomeBatch } from "@/lib/whatsappWelcome";
import { runAutomationRules, type EngineSummary } from "@/lib/rulesEngine";
import { hasCronSecret } from "@/lib/secrets";
import { isTemporaryBlock } from "@/lib/sendGate";
import { alertAdmin } from "@/lib/adminAlert";
import { runWatchdog, withHeartbeat } from "@/lib/jobHealth";

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
  return hasCronSecret(req);
}

export const GET = withHeartbeat("scheduled", async (req: NextRequest) => {
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
  let deferred = 0;
  let sendFailed = 0; // כשלי שליחה בלבד (לא "לליד אין טלפון")
  let lastSendError: string | undefined;
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
    } else if (isTemporaryBlock(res.blocked)) {
      // לילה, שבת/חג או בדיקת הסרה שלא הצליחה: חוזרת לתור ותישלח בריצה
      // הראשונה שמותר. קודם סומנה "נכשלה" לתמיד — הודעה שרכזת תזמנה ל-07:30
      // פשוט לא יצאה, ואיש לא ידע.
      deferred++;
      await db
        .from("scheduled_messages")
        .update({ status: "pending", sent_at: null, error: res.error ?? null })
        .eq("id", row.id);
    } else {
      failed++;
      sendFailed++;
      lastSendError = res.error ?? "send failed";
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

  // ── שלב 3: מנוע החוקים (ראו "ספר מנוע החוקים") ─────────────
  let automation: EngineSummary = { rules: 0, matched: 0, executed: 0, skipped: 0, errors: 0 };
  try {
    automation = await runAutomationRules(db);
  } catch (e) {
    console.error("[cron/scheduled] rules engine failed:", e);
  }

  // ── שלב 4: השומר — משימה שנתקעה → התראה לאדמין (lib/jobHealth.ts) ──
  let watchdog: Awaited<ReturnType<typeof runWatchdog>> | { error: string };
  try {
    watchdog = await runWatchdog(db);
  } catch (e) {
    console.error("[cron/scheduled] watchdog failed:", e);
    watchdog = { error: e instanceof Error ? e.message : String(e) };
  }

  // כל ההודעות המתוזמנות שהגיע זמנן נכשלו — הערוץ נפל, לא הודעה בודדת
  const outage = sendFailed > 0 && sent === 0;
  return NextResponse.json({
    ok: !outage,
    ...(outage ? { error: `${sendFailed} הודעות מתוזמנות נכשלו — ${lastSendError}` } : {}),
    due: due?.length ?? 0,
    sent,
    deferred,
    failed,
    monitored,
    welcome,
    automation,
    watchdog,
  });
});

const BAD_STATES: InstanceState[] = ["yellowCard", "blocked", "notAuthorized"];

async function monitorInstances(db: ReturnType<typeof admin>): Promise<number> {
  const { data: accounts } = await db
    .from("whatsapp_accounts")
    .select("instance_id, api_token, label, is_active, bot_enabled, last_state")
    .eq("is_active", true);

  let checked = 0;
  for (const a of accounts ?? []) {
    // החשבון המלא, כולל provider. 17.09: אחרי שהמספר של תמי עבר ל-360dialog
    // וה-GreenAPI הישן שלו נותק, הניטור בדק אותו מול GreenAPI ושלח לסער
    // "המספר עבר למצב notAuthorized" — על מספר שעובד מצוין.
    const acc: WhatsAppAccount = {
      ...(await getAccountByInstance(String(a.instance_id))),
      label: (a.label as string) ?? null,
    };
    let state: InstanceState = "unknown";
    // אם החשבון לא נמצא, getAccountByInstance מחזיר את חשבון העסק במקום —
    // ואז הבדיקה רצה על מספר אחר לגמרי ונרשמת על זה שלא נבדק.
    // עדיף לדלג מלדווח על משהו שלא נמדד.
    if (acc.instanceId !== String(a.instance_id)) {
      console.error(
        `[cron/scheduled] חשבון ${a.instance_id} לא נמצא — הבדיקה היתה נופלת על ${acc.instanceId}; מדלג`
      );
      continue;
    }
    try {
      state = await getInstanceState(acc);
    } catch (e) {
      // הבליעה שקטה הפכה כל תקלה ל-"unknown" בלי שום דרך לדעת למה.
      console.error(
        `[cron/scheduled] בדיקת מצב נכשלה ל-${acc.userEmail ?? a.instance_id} (${acc.provider}/${acc.authStyle}):`,
        e instanceof Error ? e.message.slice(0, 200) : String(e)
      );
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

    const alertMsg =
      `⚠️ התראת וואטסאפ — ${a.label ?? acc.instanceId}\n` +
      `המספר עבר למצב: ${state}\n` +
      (a.bot_enabled ? "הוצא אוטומטית מסבב הבוט. " : "") +
      (acc.provider === "cloud"
        ? "מטא חוסמת שליחה מהמספר — בדוק ב-360dialog וב-WhatsApp Manager."
        : `בדוק את ה-instance בקונסולת GreenAPI.`);

    // מכל ערוץ תקין אחר — לא מהמספר שנפל
    const res = await alertAdmin(
      {
        title: "מספר וואטסאפ נפל",
        subject: String(a.label ?? acc.instanceId),
        reason: `המספר עבר למצב ${state}.${a.bot_enabled ? " הוצא אוטומטית מסבב הבוט." : ""}`,
        text: alertMsg,
      },
      { exclude: [acc.instanceId] }
    );
    if (!res.sent) {
      console.error(`[cron/scheduled] admin alert failed for ${acc.instanceId}:`, res.error);
    }
  }
  return checked;
}
