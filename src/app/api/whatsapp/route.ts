import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { processIncomingMessage } from "@/lib/aiService";
import { sendWhatsAppMessage, phoneFromChatId } from "@/lib/whatsappService";
import { LeadStatus } from "@/lib/stateMachine";
import { analyzeWhatsappMessage, type WhatsAppNLU } from "@/lib/ai/parseWhatsappMessage";

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

    // GreenAPI שולחת טקסט בשלושה סוגים: textMessage (רגיל),
    // extendedTextMessage (קישור/עיצוב), quotedMessage (תשובה עם ציטוט).
    // במקום רשימת סוגים — מחלצים טקסט מכל מקום אפשרי; אם אין, מדלגים.
    const chatId: string = body.senderData?.chatId ?? "";
    const messageText: string =
      body.messageData?.textMessageData?.textMessage ??
      body.messageData?.extendedTextMessageData?.text ??
      "";

    if (!chatId || !messageText) {
      return NextResponse.json({ ok: true });
    }

    // Convert chatId to local phone for DB lookup
    const phone = phoneFromChatId(chatId);

    // בדאטהבייס יש טלפונים בכמה פורמטים (0521234567 / 052-1234567 /
    // +972521234567) — מחפשים את כולם, אחרת לידים עם מקף לא נמצאים.
    const phoneVariants = [
      phone,
      `${phone.slice(0, 3)}-${phone.slice(3)}`,
      `+972${phone.slice(1)}`,
      `972${phone.slice(1)}`,
    ];

    // Look up lead by phone (newest first if duplicates exist)
    const supabase = getSupabase();
    const { data: leadRows } = await supabase
      .from("leads")
      .select("id, status, name, location, job_title")
      .in("phone", phoneVariants)
      .order("created_at", { ascending: false })
      .limit(1);
    const lead = leadRows?.[0] ?? null;

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
      } else if (!result.success) {
        console.error(
          `[WhatsApp Webhook] Agent failed for lead ${lead.id}:`,
          result.error
        );
      }
    } else {
      // Non-screening: save the candidate's message + NLU analysis.
      // 1. Run NLU first so the inserted message row carries the result.
      let nlu: WhatsAppNLU | null = null;
      try {
        nlu = await analyzeWhatsappMessage(messageText, {
          name: lead.name,
          status: lead.status,
          location: lead.location,
          job_title: lead.job_title,
        });
      } catch (err) {
        console.error(`[WhatsApp Webhook] NLU failed for lead ${lead.id}:`, err);
      }

      // 2. Save the candidate message with extracted intent/entities.
      const { error: insertError } = await supabase.from("messages").insert({
        lead_id: lead.id,
        role: "user",
        content: messageText,
        ai_intent: nlu?.intent ?? null,
        ai_entities: nlu?.entities ?? null,
        ai_confidence: nlu?.confidence ?? null,
        ai_summary: nlu?.summary ?? null,
      });

      if (insertError) {
        console.error(
          `[WhatsApp Webhook] Failed to save message for lead ${lead.id}:`,
          insertError.message
        );
      }

      // 3. Apply NLU-driven updates to the lead.
      if (nlu) {
        const updates: Record<string, unknown> = {};
        const merged: Record<string, unknown> = {};

        // High-confidence location change is safe to auto-apply.
        if (
          nlu.intent === "location_change" &&
          nlu.entities.preferred_location &&
          nlu.confidence >= 0.7
        ) {
          updates.location = nlu.entities.preferred_location;
        }

        // Other extractions land in the preferences JSONB so reports can use
        // them without us guessing wrong on the main column.
        if (nlu.entities.available_shifts?.length) {
          merged.available_shifts = nlu.entities.available_shifts;
        }
        if (nlu.entities.unavailable_days?.length) {
          merged.unavailable_days = nlu.entities.unavailable_days;
        }
        if (typeof nlu.entities.min_salary === "number") {
          merged.min_salary = nlu.entities.min_salary;
          merged.salary_unit = nlu.entities.salary_unit ?? "unknown";
        }
        if (nlu.entities.start_date) {
          merged.start_date_requested = nlu.entities.start_date;
        }

        if (Object.keys(merged).length > 0) {
          // Read existing preferences, merge, write back.
          const { data: cur } = await supabase
            .from("leads")
            .select("preferences")
            .eq("id", lead.id)
            .single();
          updates.preferences = {
            ...((cur?.preferences as Record<string, unknown>) ?? {}),
            ...merged,
          };
        }

        // Flag for human review if the NLU says so or signals are mixed.
        if (nlu.needs_attention) {
          updates.needs_attention = true;
          updates.needs_attention_at = new Date().toISOString();
          updates.attention_reason = nlu.summary || nlu.intent;
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from("leads").update(updates).eq("id", lead.id);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[WhatsApp Webhook] Error:", err);
    // Always return 200 so Green API doesn't retry
    return NextResponse.json({ ok: true });
  }
}
