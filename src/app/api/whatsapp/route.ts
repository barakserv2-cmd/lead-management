import { NextRequest, NextResponse } from "next/server";
import { phoneFromChatId, getAccountByInstance } from "@/lib/whatsappService";
import { handleInboundMessage } from "@/lib/whatsappInbound";

/**
 * Webhook של GreenAPI — הערוץ הלא רשמי.
 *
 * הקובץ הזה מפענח את מבנה ה-payload של GreenAPI בלבד. כל הטיפול
 * בהודעה עצמה יושב ב-whatsappInbound, וזהה לערוץ הרשמי של מטא.
 */

// GET — Green API may ping the webhook URL to verify it's live
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

// POST — Incoming webhook from Green API
export async function POST(req: NextRequest) {
  try {
    // אימות טוקן: GreenAPI שולחת את ה-webhookUrlToken שהוגדר ב-instance
    // בכותרת Authorization. בלי env מוגדר — אין אכיפה (פיתוח מקומי);
    // עם env — כל בקשה בלי הטוקן הנכון נדחית ב-401.
    const expectedToken = (process.env.GREEN_API_WEBHOOK_TOKEN ?? "").trim();
    if (expectedToken) {
      const auth = req.headers.get("authorization") ?? "";
      const got = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
      if (got !== expectedToken) {
        console.warn("[WhatsApp Webhook] rejected: bad or missing webhook token");
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    const body = await req.json();

    // incomingMessageReceived — a candidate wrote to us.
    // outgoingMessageReceived — a recruiter wrote to a candidate straight from
    // the WhatsApp app on their own phone (personal instances only). We mirror
    // it into the CRM chat so the conversation stays complete.
    const isIncoming = body.typeWebhook === "incomingMessageReceived";
    const isOutgoingFromPhone = body.typeWebhook === "outgoingMessageReceived";
    if (!isIncoming && !isOutgoingFromPhone) {
      return NextResponse.json({ ok: true });
    }

    // GreenAPI שולחת טקסט בשלושה סוגים: textMessage (רגיל),
    // extendedTextMessage (קישור/עיצוב), quotedMessage (תשובה עם ציטוט).
    // במקום רשימת סוגים — מחלצים טקסט מכל מקום אפשרי; אם אין, מדלגים.
    const chatId: string = body.senderData?.chatId ?? "";
    const messageText: string =
      body.messageData?.textMessageData?.textMessage ??
      body.messageData?.extendedTextMessageData?.text ??
      "";

    if (!chatId || !messageText || chatId.endsWith("@g.us")) {
      return NextResponse.json({ ok: true });
    }

    // Which number received this? Personal recruiter instance or the business
    // one. Replies go back out from the same number.
    const account = await getAccountByInstance(body.instanceData?.idInstance);

    const result = await handleInboundMessage(account, {
      phone: phoneFromChatId(chatId),
      text: messageText,
      senderName: body.senderData?.senderName ?? null,
      direction: isIncoming ? "in" : "out",
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[WhatsApp Webhook] Error:", err);
    // Always return 200 so Green API doesn't retry
    return NextResponse.json({ ok: true });
  }
}
