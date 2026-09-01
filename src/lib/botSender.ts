// ============================================================
// Bot sender — בחירת המספר להודעות הפתיחה הקרות (סבב + מכסה)
// ============================================================
//
// המספרים המשתתפים: whatsapp_accounts עם bot_enabled=true (המספר
// הייעודי, כשיקושר). כשאין אף אחד — נופלים למספר העסקי מה-env.
// הבחירה: המספר עם הכי מעט הודעות פתיחה היום (איזון טבעי), ורק
// מתחת למכסה היומית. כולם מעל המכסה → null והליד מחכה בתור.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  businessAccount,
  type WhatsAppAccount,
} from "@/lib/whatsappService";
import { botDailyCapPerNumber } from "@/lib/botConfig";

interface BotAccountRow {
  user_email: string;
  instance_id: string;
  api_token: string;
  phone: string | null;
  label: string | null;
}

/** תחילת היום הנוכחי בישראל, כ-ISO אמיתי (sent_at הוא זמן אמת). */
function israelDayStartIso(): string {
  const dayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
  }).format(new Date());
  // 00:00 שעון ישראל = 21:00/22:00 UTC של אתמול; מספיק מדויק למכסה
  // יומית להשתמש בגבול UTC-3 קבוע.
  const d = new Date(`${dayStr}T00:00:00+03:00`);
  return d.toISOString();
}

export async function pickBotSender(
  admin: SupabaseClient
): Promise<WhatsAppAccount | null> {
  const { data: rows } = await admin
    .from("whatsapp_accounts")
    .select("user_email, instance_id, api_token, phone, label")
    .eq("is_active", true)
    .eq("bot_enabled", true);

  const candidates: WhatsAppAccount[] =
    rows && rows.length > 0
      ? (rows as BotAccountRow[]).map((r) => ({
          instanceId: r.instance_id,
          token: r.api_token,
          userEmail: r.user_email,
          label: r.label,
          phone: r.phone,
        }))
      : [businessAccount()];

  // ספירת הפתיחות שנשלחו היום פר מספר
  const { data: sentToday } = await admin
    .from("bot_outbox")
    .select("via_instance")
    .eq("status", "sent")
    .gte("sent_at", israelDayStartIso());

  const counts = new Map<string, number>();
  for (const row of sentToday ?? []) {
    const k = String(row.via_instance ?? "");
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const cap = botDailyCapPerNumber();
  let best: WhatsAppAccount | null = null;
  let bestCount = Infinity;
  for (const acc of candidates) {
    const c = counts.get(acc.instanceId) ?? 0;
    if (c >= cap) continue;
    if (c < bestCount) {
      best = acc;
      bestCount = c;
    }
  }
  return best;
}
