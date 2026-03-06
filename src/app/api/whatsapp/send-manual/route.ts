import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsappService";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST — Recruiter sends a manual WhatsApp message from the CRM chat
export async function POST(req: NextRequest) {
  try {
    const { leadId, message } = await req.json();

    if (!leadId || !message?.trim()) {
      return NextResponse.json(
        { success: false, error: "חסרים פרמטרים (leadId, message)" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

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
    });

    if (insertError) {
      return NextResponse.json(
        { success: false, error: `שגיאה בשמירת ההודעה: ${insertError.message}` },
        { status: 500 }
      );
    }

    // Send via WhatsApp if lead has a phone number
    let whatsappSent = false;
    if (lead.phone) {
      const result = await sendWhatsAppMessage(lead.phone, message.trim());
      whatsappSent = result.success;
      if (!result.success) {
        console.error(
          `[Manual Send] WhatsApp send failed for lead ${leadId}:`,
          result.error
        );
      }
    }

    return NextResponse.json({ success: true, whatsappSent });
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
