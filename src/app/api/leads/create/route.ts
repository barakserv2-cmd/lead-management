import { NextRequest, NextResponse } from "next/server";
import { validateApiKey, unauthorizedResponse, getSupabaseAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { name, phone, role, source } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Check for duplicate by phone (if provided)
    if (phone) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id, name")
        .eq("phone", phone)
        .single();

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
      return NextResponse.json(
        { error: `Insert failed: ${insertError.message}` },
        { status: 500 }
      );
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
