import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage, resolveSender } from "@/lib/whatsappService";
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
    const { leadId, message } = await req.json();

    if (!leadId || !message?.trim()) {
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

    // Save the recruiter message to DB
    const { error: insertError } = await supabase.from("messages").insert({
      lead_id: leadId,
      role: "recruiter",
      content: message.trim(),
      sent_by: user.email ?? null,
      via_instance: sender.instanceId,
    });

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
      return NextResponse.json({
        success: false,
        savedToChat: true,
        error: sender.userEmail
          ? "ההודעה נשמרה בצ'אט אבל לא נשלחה — הוואטסאפ האישי שלך כנראה מנותק. בדוק בהגדרות > וואטסאפ."
          : "ההודעה נשמרה בצ'אט אבל לא נשלחה לוואטסאפ — ייתכן שהחיבור נותק. פנה למנהל המערכת.",
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
