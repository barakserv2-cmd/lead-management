// ============================================================
// WhatsApp Welcome — הודעת הפתיחה של הבוט לליד חדש (שלב 1)
// ============================================================
//
// הזרימה: יצירת ליד → enqueueWelcome (בדיקת מתג/מקור, רישום בתור)
// → deliverWelcome (בחירת מספר בסבב, שער שליחה, מעברי סטטוס, שליחה).
// במצב shadow — הבוט מנסח את הפתיחה ושומר אותה לבדיקה, בלי לשלוח
// ובלי לגעת בליד. runWelcomeBatch מרוקן את התור (ליד שחיכה בגלל
// מכסה/שעות שקט) — נקרא מסריקת ה-Gmail ומה-cron של 5 הדקות.

import { createClient as createServerClient } from "@supabase/supabase-js";
import { changeLeadStatus } from "@/lib/actions/changeLeadStatus";
import { generateShadowWelcome, processIncomingMessage } from "@/lib/aiService";
import { sendWhatsAppMessage } from "@/lib/whatsappService";
import { pickBotSender } from "@/lib/botSender";
import {
  botMode,
  botSourceEnabled,
  FRESH_LEAD_MINUTES,
  WELCOME_BATCH_LIMIT,
  WELCOME_SPACING_MS,
} from "@/lib/botConfig";
import { LeadStatus } from "@/lib/stateMachine";

function admin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = ([min, max]: [number, number]) =>
  min + Math.floor(Math.random() * (max - min));

/**
 * נקודת הכניסה מיצירת ליד. מחזירה מהר; deliver=true שולח מיד (ליד
 * בודד מהאתר), deliver=false רק רושם לתור (סריקת Gmail — המנה
 * מעובדת בסוף הסריקה עם מרווחים).
 */
export async function enqueueWelcome(
  leadId: string,
  phone: string | null,
  source: string | null,
  opts: { deliver?: boolean } = {}
): Promise<void> {
  const mode = botMode();
  if (mode === "off") return;
  if (!phone) return;
  if (!botSourceEnabled(source)) return;

  if (mode === "shadow") {
    await recordShadowWelcome(leadId);
    return;
  }

  const db = admin();
  const { error } = await db.from("bot_outbox").insert({
    lead_id: leadId,
    phone,
    source,
  });
  // UNIQUE(lead_id) — ליד שכבר בתור/נשלח לא נכנס שוב
  if (error) {
    if (!error.message.includes("duplicate")) {
      console.error(`[Welcome] enqueue failed for ${leadId}:`, error.message);
    }
    return;
  }

  if (opts.deliver !== false) {
    await deliverWelcome(leadId).catch((e) =>
      console.error(`[Welcome] deliver failed for ${leadId}:`, e)
    );
  }
}

/** מצב צל: ניסוח בלבד + שמירה לטבלת הבדיקה. אפס נגיעה בליד. */
async function recordShadowWelcome(leadId: string): Promise<void> {
  const result = await generateShadowWelcome(leadId);
  if (!result.success || !result.evaluation) {
    console.error(`[Welcome/shadow] generation failed for ${leadId}:`, result.error);
    return;
  }
  const e = result.evaluation;
  await admin().from("bot_shadow_replies").insert({
    lead_id: leadId,
    trigger_type: "welcome",
    incoming_text: null,
    proposed_reply: e.reply,
    action: e.action,
    human_reason: e.human_reason ?? null,
    screening_score: e.screening_score,
  });
}

/**
 * שליחת הפתיחה לליד אחד מהתור: בחירת מספר (סבב + מכסה), שער שליחה,
 * מעברי סטטוס, יצירת ההודעה ב-AI ושליחה. עדכון התור בהתאם לתוצאה.
 */
export async function deliverWelcome(leadId: string): Promise<boolean> {
  const db = admin();

  const { data: row } = await db
    .from("bot_outbox")
    .select("id, phone, status, created_at")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (!row || row.status !== "pending") return false;

  const { data: lead } = await db
    .from("leads")
    .select("status, do_not_contact, created_at")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead || lead.status !== LeadStatus.NEW_LEAD || lead.do_not_contact) {
    await db
      .from("bot_outbox")
      .update({ status: "skipped", error: "הליד כבר לא במצב חדש / opt-out" })
      .eq("id", row.id);
    return false;
  }

  // בחירת מספר — כולם במכסה מלאה? הליד מחכה לריצה הבאה.
  const sender = await pickBotSender(db);
  if (!sender) return false;

  // ליד טרי = המועמד פעיל עכשיו → פטור משעות שקט (automated=false).
  // ליד ישן מהתור (חיכה למכסה) → כפוף לשעות שקט כרגיל.
  const ageMin = (Date.now() - new Date(lead.created_at).getTime()) / 60000;
  const isFresh = ageMin <= FRESH_LEAD_MINUTES;

  // מעברי סטטוס: NEW_LEAD → CONTACTED → SCREENING_IN_PROGRESS
  const step1 = await changeLeadStatus({
    leadId,
    newStatus: LeadStatus.CONTACTED,
    userId: "ai-recruiter",
    notes: "נוצר קשר אוטומטי — הודעת וואטסאפ ראשונה",
  });
  if (!step1.success) {
    await db.from("bot_outbox").update({ status: "failed", error: step1.error }).eq("id", row.id);
    return false;
  }
  const step2 = await changeLeadStatus({
    leadId,
    newStatus: LeadStatus.SCREENING_IN_PROGRESS,
    userId: "ai-recruiter",
    notes: "סינון AI התחיל אוטומטית",
  });
  if (!step2.success) {
    await db.from("bot_outbox").update({ status: "failed", error: step2.error }).eq("id", row.id);
    return false;
  }

  // ניסוח הפתיחה (נשמרת גם לשיחה בכרטיס)
  const result = await processIncomingMessage(leadId, "היי, אני מעוניין/ת בעבודה", sender.instanceId);
  if (!result.success || !result.aiReply) {
    await db
      .from("bot_outbox")
      .update({ status: "failed", error: result.error ?? "AI failed" })
      .eq("id", row.id);
    // כשל בוט = דגל לרכזת, שהמועמד לא ייפול בין הכיסאות
    await db
      .from("leads")
      .update({
        needs_attention: true,
        needs_attention_at: new Date().toISOString(),
        attention_reason: "הבוט נכשל בניסוח הודעת פתיחה — נדרש טיפול ידני",
      })
      .eq("id", leadId);
    return false;
  }

  const sendRes = await sendWhatsAppMessage(row.phone, result.aiReply, sender, {
    automated: !isFresh,
  });

  if (sendRes.success) {
    await db
      .from("bot_outbox")
      .update({ status: "sent", sent_at: new Date().toISOString(), via_instance: sender.instanceId })
      .eq("id", row.id);
    return true;
  }

  // שעות שקט על ליד ישן — נשאר בתור לריצת הבוקר; כשל אחר — failed.
  if (sendRes.blocked === "quiet_hours") return false;
  await db
    .from("bot_outbox")
    .update({ status: sendRes.blocked === "do_not_contact" ? "skipped" : "failed", error: sendRes.error })
    .eq("id", row.id);
  return false;
}

/**
 * ריקון התור: עד WELCOME_BATCH_LIMIT פתיחות בריצה, עם מרווח אנושי
 * ביניהן. נקרא בסוף סריקת ה-Gmail (כל 2 דק') ומ-cron/scheduled (5 דק').
 */
export async function runWelcomeBatch(): Promise<{ sent: number; pending: number }> {
  if (botMode() !== "live") return { sent: 0, pending: 0 };

  const db = admin();
  const { data: due } = await db
    .from("bot_outbox")
    .select("lead_id")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(WELCOME_BATCH_LIMIT);

  let sent = 0;
  for (const [i, row] of (due ?? []).entries()) {
    if (i > 0) await sleep(jitter(WELCOME_SPACING_MS));
    const ok = await deliverWelcome(row.lead_id as string).catch(() => false);
    if (ok) sent++;
  }

  const { count } = await db
    .from("bot_outbox")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return { sent, pending: count ?? 0 };
}

/**
 * תאימות לאחור: הקריאה הקיימת מ-api/leads/create. ליד בודד מהאתר —
 * נרשם ונשלח מיד (בכפוף למתג, למקור ולשער).
 */
export async function sendWelcomeMessage(
  leadId: string,
  phone: string
): Promise<void> {
  const { data: lead } = await admin()
    .from("leads")
    .select("source")
    .eq("id", leadId)
    .maybeSingle();
  await enqueueWelcome(leadId, phone, (lead?.source as string) ?? null, { deliver: true });
}
