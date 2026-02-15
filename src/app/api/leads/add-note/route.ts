import { NextRequest, NextResponse } from "next/server";
import { validateApiKey, unauthorizedResponse, getSupabaseAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { lead_id, note } = body;

    if (!lead_id || !note) {
      return NextResponse.json(
        { error: "Missing required fields: lead_id, note" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Get current lead
    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("id, name, notes")
      .eq("id", lead_id)
      .single();

    if (fetchError || !lead) {
      return NextResponse.json(
        { error: `Lead not found: ${lead_id}` },
        { status: 404 }
      );
    }

    // Append note with timestamp
    const timestamp = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    const newNote = `[${timestamp}] ${note}`;
    const updatedNotes = lead.notes
      ? `${lead.notes}\n${newNote}`
      : newNote;

    const { error: updateError } = await supabase
      .from("leads")
      .update({ notes: updatedNotes })
      .eq("id", lead_id);

    if (updateError) {
      return NextResponse.json(
        { error: `Update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      lead_id,
      name: lead.name,
      note: newNote,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body" },
      { status: 400 }
    );
  }
}
