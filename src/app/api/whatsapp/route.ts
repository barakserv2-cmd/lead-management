import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { processIncomingMessage } from "@/lib/aiService";
import {
  sendWhatsAppMessage,
  phoneFromChatId,
  getAccountByInstance,
} from "@/lib/whatsappService";
import { LeadStatus } from "@/lib/stateMachine";
import { isOptOutMessage, OPT_OUT_CONFIRMATION } from "@/lib/sendGate";
import { analyzeWhatsappMessage, type WhatsAppNLU } from "@/lib/ai/parseWhatsappMessage";
import {
  createLeadFromPublication,
  matchPublication,
  recordResponse,
} from "@/lib/fbInbound";

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
    let lead = leadRows?.[0] ?? null;

    // Did this message come from a Facebook-group post? The wa.me link we
    // publish prefills a BK-XXXX code, so its presence both identifies the
    // exact post and proves the sender is a candidate — which is what lets us
    // open a lead for a number nobody in the CRM has seen before.
    const publication = isIncoming ? await matchPublication(messageText) : null;

    if (!lead && publication) {
      const senderName: string | null = body.senderData?.senderName ?? null;
      const newLeadId = await createLeadFromPublication(phone, senderName, publication);
      if (newLeadId) {
        const { data: created } = await supabase
          .from("leads")
          .select("id, status, name, location, job_title")
          .eq("id", newLeadId)
          .maybeSingle();
        lead = created ?? null;
        console.log(
          `[WhatsApp Webhook] New lead ${newLeadId} from group post ${publication.tracking_code}`
        );
      }
    }

    // No lead found — ignore
    if (!lead) {
      return NextResponse.json({ ok: true });
    }

    if (publication) {
      await recordResponse(lead.id, publication);
    }

    // Recruiter replied from their phone app → mirror as a recruiter message.
    if (isOutgoingFromPhone) {
      if (!account.userEmail) return NextResponse.json({ ok: true });
      const { error: mirrorError } = await supabase.from("messages").insert({
        lead_id: lead.id,
        role: "recruiter",
        content: messageText,
        sent_by: account.userEmail,
        via_instance: account.instanceId,
      });
      if (mirrorError) {
        console.error(
          `[WhatsApp Webhook] Failed to mirror phone message for lead ${lead.id}:`,
          mirrorError.message
        );
      }
      return NextResponse.json({ ok: true });
    }

    // בקשת הסרה מדיוור — נבדקת דטרמיניסטית לפני הבוט וה-NLU, כדי
    // שבקשה כזו תיתפס ב-100% מהמקרים ולא תלויה בשיקול דעת של מודל.
    if (isOptOutMessage(messageText)) {
      await supabase.from("messages").insert({
        lead_id: lead.id,
        role: "user",
        content: messageText,
        via_instance: account.instanceId,
      });
      await supabase
        .from("leads")
        .update({ do_not_contact: true })
        .eq("id", lead.id);
      await supabase.from("lead_events").insert({
        lead_id: lead.id,
        event_type: "פרטיות",
        event_text: `בקשת הסרה מדיוור בוואטסאפ ("${messageText.slice(0, 80)}") — כל שליחה עתידית נחסמת`,
        created_by: "מערכת",
      });

      // הודעת האישור היחידה — עוקפת את השער בכוונה ורק כאן.
      const confirmRes = await sendWhatsAppMessage(phone, OPT_OUT_CONFIRMATION, account, {
        skipGate: true,
      });
      if (confirmRes.success) {
        await supabase.from("messages").insert({
          lead_id: lead.id,
          role: "recruiter",
          content: OPT_OUT_CONFIRMATION,
          sent_by: "מערכת",
          via_instance: account.instanceId,
        });
      }
      console.log(`[WhatsApp Webhook] opt-out recorded for lead ${lead.id}`);
      return NextResponse.json({ ok: true, optOut: true });
    }

    if (lead.status === LeadStatus.SCREENING_IN_PROGRESS) {
      // Screening mode: process through AI and auto-reply
      const result = await processIncomingMessage(lead.id, messageText, account.instanceId);

      if (result.success && result.aiReply) {
        // תשובה להודעה נכנסת — המועמד/ת כתב/ה ברגע זה, ולכן לא כפופה
        // לשעות שקט (automated). השער עדיין חוסם אם הופעל opt-out.
        const sendResult = await sendWhatsAppMessage(phone, result.aiReply, account);
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
        via_instance: account.instanceId,
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
