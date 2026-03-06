import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { processIncomingMessage } from "@/lib/aiService";
import { sendWhatsAppMessage, phoneFromChatId } from "@/lib/whatsappService";
import { LeadStatus } from "@/lib/stateMachine";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET — Green API may ping the webhook URL to verify it's live
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

// POST — Incoming webhook from Green API
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Only handle incoming text messages
    if (body.typeWebhook !== "incomingMessageReceived") {
      return NextResponse.json({ ok: true });
    }

    const typeMessage = body.messageData?.typeMessage;
    if (typeMessage !== "textMessage") {
      return NextResponse.json({ ok: true });
    }

    const chatId: string = body.senderData?.chatId ?? "";
    const messageText: string =
      body.messageData?.textMessageData?.textMessage ?? "";

    if (!chatId || !messageText) {
      return NextResponse.json({ ok: true });
    }

    // Convert chatId to local phone for DB lookup
    const phone = phoneFromChatId(chatId);

    // Look up lead by phone
    const supabase = getSupabase();
    const { data: lead } = await supabase
      .from("leads")
      .select("id, status")
      .eq("phone", phone)
      .single();

    // No lead found — ignore
    if (!lead) {
      return NextResponse.json({ ok: true });
    }

    if (lead.status === LeadStatus.SCREENING_IN_PROGRESS) {
      // Screening mode: process through AI and auto-reply
      const result = await processIncomingMessage(lead.id, messageText);

      if (result.success && result.aiReply) {
        const sendResult = await sendWhatsAppMessage(phone, result.aiReply);
        if (!sendResult.success) {
          console.error(
            `[WhatsApp Webhook] Failed to send reply for lead ${lead.id}:`,
            sendResult.error
          );
        }
      }
    } else {
      // Non-screening: save the candidate's message to DB only (no AI)
      const { error: insertError } = await supabase.from("messages").insert({
        lead_id: lead.id,
        role: "user",
        content: messageText,
      });

      if (insertError) {
        console.error(
          `[WhatsApp Webhook] Failed to save message for lead ${lead.id}:`,
          insertError.message
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[WhatsApp Webhook] Error:", err);
    // Always return 200 so Green API doesn't retry
    return NextResponse.json({ ok: true });
  }
}
