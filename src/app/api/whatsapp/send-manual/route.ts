import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import {
  sendWhatsAppMessage,
  resolveSender,
  checkWhatsappExists,
  lastInboundAt,
  isWithinServiceWindow,
} from "@/lib/whatsappService";
import { getMessageScope } from "@/lib/messageVisibility";
import { createClient as createCookieClient } from "@/lib/supabase/server";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST — Recruiter sends a manual WhatsApp message from the CRM chat
export async function POST(req: NextRequest) {
  // Only a signed-in recruiter may send from the business number.
  const cookieClient = await createCookieClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { leadId, message, check } = await req.json();

    // check: בדיקה בלבד, לפני שהצ'אט עוצר את הבוט — בלי לשמור ובלי לשלוח
    if (!leadId || (!check && !message?.trim())) {
      return NextResponse.json(
        { success: false, error: "חסרים פרמטרים (leadId, message)" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Send from the recruiter's own WhatsApp if they linked one, otherwise
    // from the business number.
    const scope = await getMessageScope(user.email);
    if (!scope.canSend) {
      return NextResponse.json(
        { success: false, error: "אין לך מספר וואטסאפ מחובר — אפשר לצפות בשיחה אבל לא לשלוח. חבר מספר בהגדרות > הוואטסאפ שלי." },
        { status: 403 }
      );
    }
    const sender = await resolveSender(user.email);

    // Look up lead to get phone
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, phone, name")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { success: false, error: "ליד לא נמצא" },
        { status: 404 }
      );
    }

    // ערוץ רשמי עם חלון סגור: ההודעה לא תצא, אז לא שומרים אותה בצ'אט
    // ולא עוצרים את הבוט. עד 16.09 הבוט נעצר קודם והשליחה נכשלה אחר כך —
    // מועמד שהבוט טיפל בו נשאר בלי אף אחד.
    if (lead.phone && sender.provider === "cloud") {
      const last = await lastInboundAt(lead.phone, sender.instanceId);
      if (!isWithinServiceWindow(last)) {
        // המועמד/ת מדברים עם הבוט והחלון שם פתוח? התשובה יוצאת ממספר הבוט,
        // באותה שיחה (17.09 — תמי לקחה שליטה ונחסמה).
        const { sendViaMachine } = await import("@/lib/machineBridge");
        const probe = await sendViaMachine(lead.phone, "", { check: true });
        if (probe.ok) {
          if (check) return NextResponse.json({ success: true, via: "bot" });
          const { data: row, error: rowErr } = await supabase
            .from("messages")
            .insert({ lead_id: leadId, role: "recruiter", content: message.trim(), sent_by: user.email ?? null })
            .select("id")
            .single();
          if (rowErr) {
            return NextResponse.json({ success: false, error: `שגיאה בשמירת ההודעה: ${rowErr.message}` }, { status: 500 });
          }
          const sent = await sendViaMachine(lead.phone, message.trim());
          if (!sent.ok) {
            await supabase.from("messages")
              .update({ delivery_status: "failed", delivery_error: "לא הצלחתי להעביר את ההודעה למספר הבוט", delivery_updated_at: new Date().toISOString() })
              .eq("id", row.id);
            return NextResponse.json({ success: false, savedToChat: true, error: "ההודעה לא נשלחה — לא הצלחתי להעביר אותה למספר הבוט. נסי שוב." });
          }
          // מזהה ההודעה וסימני המסירה מגיעים מגובגט כשההודעה יוצאת בפועל
          return NextResponse.json({ success: true, whatsappSent: true, via: "bot", sentFrom: "מספר הבוט 050-700-8171" });
        }
        const from = sender.userEmail === user.email?.toLowerCase() ? "" : ` (${sender.label ?? "מספר ברירת המחדל"})`;
        return NextResponse.json({
          success: false,
          savedToChat: false,
          windowClosed: true,
          error:
            `אי אפשר לשלוח מכאן${from} — המועמד/ת לא כתבו למספר הזה ב-24 השעות האחרונות, ` +
            "ומטא מאפשרת רק תבנית מאושרת. הבוט ממשיך לנהל את השיחה. אפשר להתקשר, או לכתוב מאפליקציית WhatsApp Business בטלפון.",
        });
      }
    }
    if (check) {
      return NextResponse.json({ success: true });
    }

    // Save the recruiter message to DB
    const { data: savedRow, error: insertError } = await supabase
      .from("messages")
      .insert({
        lead_id: leadId,
        role: "recruiter",
        content: message.trim(),
        sent_by: user.email ?? null,
        via_instance: sender.instanceId,
      })
      .select("id")
      .single();

    if (insertError) {
      return NextResponse.json(
        { success: false, error: `שגיאה בשמירת ההודעה: ${insertError.message}` },
        { status: 500 }
      );
    }

    // Send via WhatsApp if lead has a phone number
    let whatsappSent = false;
    let whatsappError: string | null = null;
    if (lead.phone) {
      const result = await sendWhatsAppMessage(lead.phone, message.trim(), sender);
      whatsappSent = result.success;
      // המזהה מחבר את ההודעה לעדכוני המסירה שיגיעו מהספק. כישלון מיידי
      // מסומן כבר עכשיו, כדי שהבועה בצ'אט תראה ❌ ולא וי.
      if (savedRow?.id) {
        await supabase
          .from("messages")
          .update(
            result.success
              ? { provider_msg_id: result.idMessage ?? null, delivery_status: "sent", delivery_updated_at: new Date().toISOString() }
              : { delivery_status: "failed", delivery_error: result.error ?? "השליחה נכשלה", delivery_updated_at: new Date().toISOString() }
          )
          .eq("id", savedRow.id);
      }
      if (result.success) {
        // גשר התשובות למכונת הגיוס (fire-and-forget)
        const { forwardReplyToMachine } = await import("@/lib/machineBridge");
        await forwardReplyToMachine(lead.phone, message.trim(), "human");
      }
      if (!result.success) {
        whatsappError = result.error ?? "שליחה נכשלה";
        console.error(
          `[Manual Send] WhatsApp send failed for lead ${leadId}:`,
          result.error
        );
      }
    }

    // כישלון וואטסאפ הוא לא הצלחה שקטה — הרכזת חייבת לדעת שההודעה
    // לא הגיעה למועמד (למשל כשהחיבור ל-GreenAPI נפל).
    if (lead.phone && !whatsappSent) {
      // Name the real reason. A candidate with no WhatsApp on that number
      // (test leads, landlines, typos) is not a connection problem — telling
      // the recruiter to "check your WhatsApp" sends them chasing a ghost.
      const exists = await checkWhatsappExists(lead.phone, sender);
      const error =
        exists === false
          ? `ההודעה נשמרה בצ'אט אבל לא נשלחה — המספר ${lead.phone} לא רשום בוואטסאפ (מספר שגוי/קווי/בדיקה). נסו להתקשר או לאמת את המספר.`
          : sender.userEmail
            ? "ההודעה נשמרה בצ'אט אבל לא נשלחה — הוואטסאפ האישי שלך כנראה מנותק. בדוק בהגדרות > וואטסאפ."
            : "ההודעה נשמרה בצ'אט אבל לא נשלחה לוואטסאפ — ייתכן שהחיבור נותק. פנה למנהל המערכת.";
      return NextResponse.json({
        success: false,
        savedToChat: true,
        numberNotOnWhatsapp: exists === false,
        error,
        detail: whatsappError,
      });
    }

    return NextResponse.json({
      success: true,
      whatsappSent,
      sentFrom: sender.label ?? sender.phone ?? null,
    });
  } catch (err) {
    console.error("[Manual Send] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "שגיאה לא צפויה",
      },
      { status: 500 }
    );
  }
}
