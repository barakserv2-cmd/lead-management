import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { validateApiKey, unauthorizedResponse, getSupabaseAdmin } from "@/lib/api-auth";
import { sendWelcomeMessage } from "@/lib/whatsappWelcome";
import { normalizePhone } from "@/lib/phone";
import { findLeadByPhone, isPhoneUniqueViolation } from "@/lib/leadPhoneGuard";

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { name, role, source } = body;
    // canonical form (10 digits) — the DB trigger does the same, but we
    // normalise here so the duplicate pre-check matches by candidate, not string
    const phone = normalizePhone(body.phone);

    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Check for duplicate by phone (if provided)
    if (phone) {
      const existing = await findLeadByPhone(supabase, phone);
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: "duplicate",
            message: `ליד עם טלפון ${phone} כבר קיים (${existing.name})`,
            existing_lead_id: existing.id,
          },
          { status: 409 }
        );
      }
    }

    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        name,
        phone: phone || null,
        job_title: role || "כללי",
        source: source || "אחר",
        status: "NEW_LEAD",
      })
      .select("id, name, phone, job_title")
      .single();

    if (insertError) {
      if (isPhoneUniqueViolation(insertError)) {
        const existing = await findLeadByPhone(supabase, phone);
        return NextResponse.json(
          {
            success: false,
            error: "duplicate",
            message: `ליד עם טלפון ${phone} כבר קיים${existing ? ` (${existing.name})` : ""}`,
            existing_lead_id: existing?.id ?? null,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: `Insert failed: ${insertError.message}` },
        { status: 500 }
      );
    }

    // הודעת הפתיחה של הבוט — רצה אחרי שהתשובה חוזרת לטופס, עם ערבות
    // ש-Vercel לא יקפיא את הפונקציה באמצע (fire-and-forget רגיל נהרג
    // ברגע שהתשובה נשלחת, וקריאת ה-AI לא הספיקה להסתיים).
    if (lead.phone) {
      after(sendWelcomeMessage(lead.id, lead.phone).catch(console.error));
    }

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      name: lead.name,
      phone: lead.phone,
      role: lead.job_title,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body" },
      { status: 400 }
    );
  }
}
