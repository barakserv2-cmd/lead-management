import { NextRequest, NextResponse } from "next/server";
import {
  getAccountByWebhookToken,
  phoneFromChatId,
  verifyBearerSecret,
  verifyMetaSignature,
  type WhatsAppAccount,
} from "@/lib/whatsappService";
import { handleInboundMessage } from "@/lib/whatsappInbound";
import { applyDeliveryStatus, describeMetaError } from "@/lib/deliveryStatus";
import { getSupabaseAdmin } from "@/lib/api-auth";
import type { InboundMedia } from "@/lib/whatsappMedia";

/**
 * Webhook של הערוץ הרשמי של מטא (WhatsApp Business Platform).
 *
 * שתי שכבות, ולכל אחת תפקיד אחר:
 *  1. הטוקן בכתובת — מנתב. מטא לא שולחת מזהה חשבון שאפשר לסמוך עליו
 *     לניתוב, ולכן הכתובת עצמה אומרת של מי המספר.
 *  2. חתימת X-Hub-Signature-256 — מאבטחת. זו הבדיקה היחידה שאי אפשר
 *     לזייף. בלי META_APP_SECRET מוגדר כל בקשה נדחית: webhook פתוח
 *     הוא בדיוק מה שנסגר כאן בדיעבד ב-00088.
 *
 * הפענוח כאן הוא של מבנה מטא בלבד; הטיפול בהודעה משותף עם GreenAPI
 * ויושב ב-whatsappInbound.
 */

interface CloudMessage {
  from?: string;
  to?: string;
  /** שניות מאז 1970 — מתי ההודעה נשלחה במקור, לא מתי הגיעה אלינו */
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  image?: CloudMediaRef;
  document?: CloudMediaRef;
  video?: CloudMediaRef;
  audio?: CloudMediaRef;
}

interface CloudMediaRef {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
}

/** עדכון מסירה של מטא: נשלחה / נמסרה / נקראה / נכשלה, לפי מזהה ההודעה. */
interface CloudStatus {
  id?: string;
  status?: string;
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
}

/** אימות הרשמה: מטא שולחת GET פעם אחת כשמחברים את ה-webhook. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const params = req.nextUrl.searchParams;

  const account = await getAccountByWebhookToken(token);
  if (
    !account ||
    params.get("hub.mode") !== "subscribe" ||
    params.get("hub.verify_token") !== token
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // מטא מצפה לגוף טקסט גולמי עם ה-challenge, לא JSON
  return new NextResponse(params.get("hub.challenge") ?? "", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * טקסט מכל סוג הודעה שמטא שולחת; null = אין מה להעביר הלאה.
 *
 * לקובץ זה הטקסט הזמני בלבד: כשיש ליד, whatsappInbound מוריד את הקובץ,
 * שומר אותו במסמכים ומחליף את הטקסט ב"נשמר" או "השמירה נכשלה".
 */
export function extractText(msg: CloudMessage): string | null {
  switch (msg.type) {
    case "text":
      return msg.text?.body?.trim() || null;
    case "button":
      return msg.button?.text?.trim() || null;
    case "interactive":
      return (
        msg.interactive?.button_reply?.title?.trim() ||
        msg.interactive?.list_reply?.title?.trim() ||
        null
      );
    case "audio":
    case "voice":
      return "[הודעה קולית התקבלה]";
    case "image":
    case "document":
    case "video":
      return msg[msg.type]?.caption?.trim() || "[קובץ התקבל]";
    case "sticker":
      return "[סטיקר]";
    default:
      return null;
  }
}

/**
 * שני מקורות, שתי דרכי אימות — וזה לא פרט טכני אלא הבדל אמיתי בחוזק.
 *
 * בחיבור ישיר למטא מגיעה חתימת HMAC על גוף הבקשה: אי אפשר לזייף בקשה
 * בלי ה-App Secret, גם אם הכתובת דלפה.
 *
 * דרך ספק אין חתימה כזו — הספק מקבל ממטא ושולח הלאה משרתיו — ולכן
 * נשאר רק סוד משותף בכותרת. בשני המקרים היעדר סוד מוגדר = דחייה.
 */
function authorize(req: NextRequest, account: WhatsAppAccount, raw: string): boolean {
  if (account.authStyle === "d360") {
    const ok = verifyBearerSecret(req.headers.get("authorization"), account.webhookSecret);
    if (!ok) console.warn("[Cloud Webhook] rejected: bad or missing webhook secret");
    return ok;
  }
  const appSecret = (process.env.META_APP_SECRET ?? "").trim();
  const ok = verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), appSecret);
  if (!ok) console.warn("[Cloud Webhook] rejected: bad or missing signature");
  return ok;
}

/**
 * הודעה ישנה = היסטוריה, לא תנועה חיה.
 *
 * 16.09, דקות אחרי חיבור המספר של תמי: מטא העבירה את הקבצים של 14 הימים
 * האחרונים (סנכרון Coexistence) כאירועי messages ו-message_echoes רגילים.
 * 157 שורות "[קובץ התקבל]" נוספו ל-44 שיחות עם השעה של היום — ובלבלו את
 * חלון 24 השעות, שחשב שמועמדים כתבו עכשיו.
 *
 * הודעה חיה מגיעה תוך שניות, והיסטוריה נושאת את שעת השליחה המקורית,
 * ולכן גבול של 15 דקות מפריד ביניהן. אין חותמת זמן — מתייחסים כחיה.
 */
/** הפניה לקובץ בהודעה (תמונה, מסמך, סרטון, קול); סטיקר לא נשמר */
export function extractMedia(msg: CloudMessage): InboundMedia | undefined {
  const kind =
    msg.type === "image" || msg.type === "document" || msg.type === "video" || msg.type === "audio"
      ? msg.type
      : null;
  const ref = kind ? msg[kind] : undefined;
  if (!kind || !ref?.id) return undefined;
  return {
    id: ref.id,
    kind,
    mimeType: ref.mime_type ?? null,
    filename: ref.filename ?? null,
    caption: ref.caption ?? null,
  };
}

export const MAX_MESSAGE_AGE_SECONDS = 15 * 60;

export function isStale(msg: CloudMessage, nowMs: number = Date.now()): boolean {
  const ts = Number(msg.timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return nowMs / 1000 - ts > MAX_MESSAGE_AGE_SECONDS;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const account = await getAccountByWebhookToken(token);
  if (!account) {
    console.warn("[Cloud Webhook] rejected: unknown webhook token");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // הגוף נקרא כטקסט גולמי — החתימה מחושבת על הבתים המקוריים, ולכן
  // req.json() כאן היה שובר את האימות.
  const raw = await req.text();
  if (!authorize(req, account, raw)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: {
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          messages?: CloudMessage[];
          message_echoes?: CloudMessage[];
          contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
          statuses?: CloudStatus[];
        };
      }>;
    }>;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const actions: string[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};

      // עדכוני מסירה להודעות שרכזת שלחה מ-V1. עד 16.09 אושרו ונזרקו, ולכן
      // אף אחד לא ידע אם מועמד קיבל הודעה. כישלון מסמן את הליד "דורש טיפול".
      for (const st of value.statuses ?? []) {
        const s = st.status;
        if (!st.id || !(s === "sent" || s === "delivered" || s === "read" || s === "failed")) continue;
        try {
          const r = await applyDeliveryStatus(
            getSupabaseAdmin(),
            st.id,
            s,
            s === "failed" ? describeMetaError(st.errors) : null,
            { flagLead: true }
          );
          actions.push(r.updated ? `status:${s}` : `status_nomatch:${s}`);
        } catch (e) {
          console.error("[Cloud Webhook] status update failed:", e);
          actions.push("status_error");
        }
      }

      // הודעות של המועמד/ת. ב-messages השדה from הוא המועמד/ת.
      for (const msg of value.messages ?? []) {
        if (isStale(msg)) {
          actions.push(`stale:${msg.type ?? "unknown"}`);
          continue;
        }
        const phone = phoneFromChatId(msg.from ?? "");
        const text = extractText(msg);
        if (!phone || !text) {
          actions.push(`ignored:${msg.type ?? "unknown"}`);
          continue;
        }
        const senderName =
          value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;
        try {
          const res = await handleInboundMessage(account, {
            phone,
            text,
            senderName,
            direction: "in",
            media: extractMedia(msg),
          });
          actions.push(String(res.optOut ? "optOut" : res.bot ? "bot" : "in"));
        } catch (e) {
          console.error("[Cloud Webhook] inbound processing failed:", e);
          actions.push("error");
        }
      }

      // Coexistence: הרכז/ת כתבו מהאפליקציה בטלפון, ומטא משקפת את זה
      // אלינו. כאן הכיוון הפוך — from הוא המספר שלנו ו-to הוא המועמד/ת,
      // ולכן הניתוב הוא לפי to. זה התחליף המדויק ל-outgoingMessageReceived
      // של GreenAPI.
      //
      // לא אומת מול echo אמיתי — אין עדיין מספר Coexistence לבדוק עליו.
      // המבנה נכתב לפי התיעוד של מטא, וסוגי revoke/edit מדולגים במכוון.
      for (const msg of value.message_echoes ?? []) {
        if (isStale(msg)) {
          actions.push(`stale_echo:${msg.type ?? "unknown"}`);
          continue;
        }
        const phone = phoneFromChatId(msg.to ?? "");
        const text = extractText(msg);
        if (!phone || !text) {
          actions.push(`ignored_echo:${msg.type ?? "unknown"}`);
          continue;
        }
        try {
          await handleInboundMessage(account, {
            phone,
            text,
            senderName: null,
            direction: "out",
          });
          actions.push("echo");
        } catch (e) {
          console.error("[Cloud Webhook] echo processing failed:", e);
          actions.push("error");
        }
      }
    }
  }

  // שורה אחת ביומן לכל בקשה — בלי זה אי אפשר לדעת מה נכנס ומה דולג
  if (actions.length) {
    console.log(`[Cloud Webhook] ${account.label ?? account.instanceId}: ${actions.join(",")}`);
  }

  // תמיד 200: שגיאה מצדנו לא צריכה לגרום למטא לשלוח את ההודעה שוב ושוב
  return NextResponse.json({ ok: true, actions });
}
