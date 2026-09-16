// ============================================================
// הודעה נכנסת — הצד המשותף לכל הספקים
// ============================================================
//
// פענוח ה-payload נשאר ב-route של כל ספק, כי רק שם יודעים איך הוא
// נראה. מרגע שיש טלפון, טקסט וכיוון — הטיפול זהה, והוא כאן:
// איתור הליד, פתיחת ליד מפוסט בפייסבוק, הסרה מדיוור, הבוט, וה-NLU.
//
// זה הקובץ שמאפשר לערוץ הרשמי של מטא להיכנס בלי לשכפל את ההיגיון
// הזה — ובלי שהעתק שני יתחיל להתפצל מהמקור בחודש הבא.

import { createClient as createServerClient } from "@supabase/supabase-js";
import { processIncomingMessage } from "@/lib/aiService";
import { sendWhatsAppMessage, type WhatsAppAccount } from "@/lib/whatsappService";
import { LeadStatus } from "@/lib/stateMachine";
import { isOptOutMessage, OPT_OUT_CONFIRMATION } from "@/lib/sendGate";
import { botModeForPhone } from "@/lib/botConfig";
import { sendBookingLinkToLead } from "@/lib/bookingSend";
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

export interface InboundMessage {
  /** טלפון מקומי, 10 ספרות */
  phone: string;
  text: string;
  senderName: string | null;
  /** in = המועמד/ת כתבו; out = הרכז/ת כתבו מהטלפון והשיחה משתקפת אלינו */
  direction: "in" | "out";
}

type LeadRow = {
  id: string;
  status: string;
  name: string | null;
  location: string | null;
  job_title: string | null;
  needs_human_attention: boolean | null;
};

const LEAD_COLUMNS = "id, status, name, location, job_title, needs_human_attention";

/**
 * בדאטהבייס יש טלפונים בכמה פורמטים (0521234567 / 052-1234567 /
 * +972521234567) — מחפשים את כולם, אחרת לידים עם מקף לא נמצאים.
 */
function phoneVariants(phone: string): string[] {
  return [phone, `${phone.slice(0, 3)}-${phone.slice(3)}`, `+972${phone.slice(1)}`, `972${phone.slice(1)}`];
}

export async function handleInboundMessage(
  account: WhatsAppAccount,
  msg: InboundMessage
): Promise<Record<string, unknown>> {
  const isIncoming = msg.direction === "in";
  const supabase = getSupabase();
  const variants = phoneVariants(msg.phone);

  const { data: leadRows } = await supabase
    .from("leads")
    .select(LEAD_COLUMNS)
    .in("phone", variants)
    .order("created_at", { ascending: false })
    .limit(1);
  let lead = (leadRows?.[0] as LeadRow | undefined) ?? null;

  // Did this message come from a Facebook-group post? The wa.me link we
  // publish prefills a BK-XXXX code, so its presence both identifies the
  // exact post and proves the sender is a candidate — which is what lets us
  // open a lead for a number nobody in the CRM has seen before.
  const publication = isIncoming ? await matchPublication(msg.text) : null;

  if (!lead && publication) {
    const newLeadId = await createLeadFromPublication(msg.phone, msg.senderName, publication);
    if (newLeadId) {
      const { data: created } = await supabase
        .from("leads")
        .select(LEAD_COLUMNS)
        .eq("id", newLeadId)
        .maybeSingle();
      lead = (created as LeadRow | null) ?? null;
      console.log(
        `[WhatsApp Inbound] New lead ${newLeadId} from group post ${publication.tracking_code}`
      );
    }
  }

  // מספר לא מוכר: במספרים רגילים מתעלמים (אנשי קשר פרטיים של רכזות
  // לא הופכים ללידים), אבל חשבון עם capture_unknown (המספר העסקי
  // של מלי) קולט כל פונה כליד חדש — אחרת ההודעה נעלמת בשקט.
  if (!lead && isIncoming && account.captureUnknown) {
    // חריג: נציג/ת לקוח (הטלפון מופיע אצל לקוח — ראשי או ברשימת
    // אנשי הקשר) לא הופך לליד מועמד. השיחה נשארת בטלפון של מלי.
    const [{ data: clientByPhone }, { data: clientByContact }] = await Promise.all([
      supabase.from("clients").select("id, name").in("phone", variants).limit(1),
      supabase.from("clients").select("id, name").contains("contact_phones", [msg.phone]).limit(1),
    ]);
    const clientMatch = clientByPhone?.[0] ?? clientByContact?.[0];
    if (clientMatch) {
      console.log(
        `[WhatsApp Inbound] inbound from client contact (${clientMatch.name}) — not creating a lead`
      );
      return { ok: true, clientContact: true };
    }

    const { data: created, error: createErr } = await supabase
      .from("leads")
      .insert({
        name: msg.senderName?.trim() || msg.phone,
        phone: msg.phone,
        source: "וואטסאפ ישיר",
        status: LeadStatus.NEW_LEAD,
        needs_attention: true,
        needs_attention_at: new Date().toISOString(),
        attention_reason: "פנייה חדשה בוואטסאפ ממספר לא מוכר",
      })
      .select(LEAD_COLUMNS)
      .maybeSingle();
    if (created) {
      lead = created as LeadRow;
      console.log(`[WhatsApp Inbound] capture_unknown: new lead ${lead.id} from ${msg.phone}`);
    } else if (createErr) {
      // מרוץ עם הודעה קודמת שיצרה כבר את הליד — ננסה שוב לאתר
      const { data: retry } = await supabase
        .from("leads")
        .select(LEAD_COLUMNS)
        .in("phone", variants)
        .order("created_at", { ascending: false })
        .limit(1);
      lead = (retry?.[0] as LeadRow | undefined) ?? null;
    }
  }

  // אין ליד — לא יוצרים אחד (ההוראה של סער על המספר של מלי בתוקף),
  // אבל הפנייה כבר לא נעלמת בשקט: נרשמת ב"פניות ללא ליד" (הגדרות)
  // לצפייה בלבד. נציג/ת לקוח מסומנים בנפרד כדי לא להתבלבל עם מועמדים.
  // (ועדת נפח הלידים 12.09, החלטה 2 — דלף מדידה, לא פיצ'ר.)
  if (!lead) {
    if (isIncoming) {
      try {
        const [{ data: byPhone }, { data: byContact }] = await Promise.all([
          supabase.from("clients").select("name").in("phone", variants).limit(1),
          supabase.from("clients").select("name").contains("contact_phones", [msg.phone]).limit(1),
        ]);
        const clientMatch = byPhone?.[0] ?? byContact?.[0];
        await supabase.rpc("record_unmatched_inbound", {
          p_phone: msg.phone,
          p_sender_name: msg.senderName,
          p_instance_id: account.instanceId,
          p_message: msg.text.slice(0, 500),
          p_is_client: Boolean(clientMatch),
          p_client_name: clientMatch?.name ?? null,
        });
      } catch (e) {
        console.error("[WhatsApp Inbound] unmatched_inbound record failed:", e);
      }
    }
    return { ok: true };
  }

  if (publication) {
    await recordResponse(lead.id, publication);
  }

  // Recruiter replied from their phone app → mirror as a recruiter message.
  if (msg.direction === "out") {
    if (!account.userEmail) return { ok: true };
    const { error: mirrorError } = await supabase.from("messages").insert({
      lead_id: lead.id,
      role: "recruiter",
      content: msg.text,
      sent_by: account.userEmail,
      via_instance: account.instanceId,
    });
    if (mirrorError) {
      console.error(
        `[WhatsApp Inbound] Failed to mirror phone message for lead ${lead.id}:`,
        mirrorError.message
      );
    }
    return { ok: true, mirrored: true };
  }

  // בקשת הסרה מדיוור — נבדקת דטרמיניסטית לפני הבוט וה-NLU, כדי
  // שבקשה כזו תיתפס ב-100% מהמקרים ולא תלויה בשיקול דעת של מודל.
  if (isOptOutMessage(msg.text)) {
    await supabase.from("messages").insert({
      lead_id: lead.id,
      role: "user",
      content: msg.text,
      via_instance: account.instanceId,
    });
    await supabase.from("leads").update({ do_not_contact: true }).eq("id", lead.id);
    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      event_type: "פרטיות",
      event_text: `בקשת הסרה מדיוור בוואטסאפ ("${msg.text.slice(0, 80)}") — כל שליחה עתידית נחסמת`,
      created_by: "מערכת",
    });

    // הודעת האישור היחידה — עוקפת את השער בכוונה ורק כאן.
    const confirmRes = await sendWhatsAppMessage(msg.phone, OPT_OUT_CONFIRMATION, account, {
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
    console.log(`[WhatsApp Inbound] opt-out recorded for lead ${lead.id}`);
    return { ok: true, optOut: true };
  }

  // המתג הראשי (שלב 1): מענה אוטומטי של הבוט רק במצב live — כללי,
  // או פר-טלפון דרך רשימת הפיילוט (SCREENING_BOT_TEST_PHONES).
  if (
    lead.status === LeadStatus.SCREENING_IN_PROGRESS &&
    botModeForPhone(msg.phone) === "live" &&
    !lead.needs_human_attention
  ) {
    // Screening mode: process through AI and auto-reply
    const result = await processIncomingMessage(lead.id, msg.text, account.instanceId);

    if (result.success && result.aiReply) {
      // תשובה להודעה נכנסת — המועמד/ת כתב/ה ברגע זה, ולכן לא כפופה
      // לשעות שקט (automated). השער עדיין חוסם אם הופעל opt-out.
      const sendResult = await sendWhatsAppMessage(msg.phone, result.aiReply, account);
      if (!sendResult.success) {
        console.error(
          `[WhatsApp Inbound] Failed to send reply for lead ${lead.id}:`,
          sendResult.error
        );
      }

      // סינון הסתיים בהצלחה → המערכת שולחת את קישור התיאום האמיתי
      // בהודעה נפרדת, מאותו מספר. הבוט עצמו לא ממציא קישורים.
      if (result.action === "ADVANCE_TO_FIT" && !result.needs_human) {
        const linkRes = await sendBookingLinkToLead(lead.id, { account });
        if (!linkRes.success) {
          console.error(
            `[WhatsApp Inbound] booking link failed for lead ${lead.id}:`,
            linkRes.error
          );
        }
      }
    } else if (!result.success) {
      console.error(`[WhatsApp Inbound] Agent failed for lead ${lead.id}:`, result.error);
    }
    return { ok: true, bot: true };
  }

  // Non-screening: save the candidate's message + NLU analysis.
  // 1. Run NLU first so the inserted message row carries the result.
  let nlu: WhatsAppNLU | null = null;
  try {
    nlu = await analyzeWhatsappMessage(msg.text, {
      name: lead.name,
      status: lead.status,
      location: lead.location,
      job_title: lead.job_title,
    });
  } catch (err) {
    console.error(`[WhatsApp Inbound] NLU failed for lead ${lead.id}:`, err);
  }

  // 2. Save the candidate message with extracted intent/entities.
  const { error: insertError } = await supabase.from("messages").insert({
    lead_id: lead.id,
    role: "user",
    content: msg.text,
    ai_intent: nlu?.intent ?? null,
    ai_entities: nlu?.entities ?? null,
    ai_confidence: nlu?.confidence ?? null,
    ai_summary: nlu?.summary ?? null,
    via_instance: account.instanceId,
  });

  if (insertError) {
    console.error(
      `[WhatsApp Inbound] Failed to save message for lead ${lead.id}:`,
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

  return { ok: true, saved: true };
}
