import { NextRequest, NextResponse } from "next/server";
import { validateApiKey, unauthorizedResponse, getSupabaseAdmin } from "@/lib/api-auth";
import { LEAD_STATUSES } from "@/lib/constants";

const VALID_STATUSES = Object.values(LEAD_STATUSES);

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { lead_id, status } = body;

    if (!lead_id || !status) {
      return NextResponse.json(
        { error: "Missing required fields: lead_id, status" },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Valid values: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Get current lead to log the status change
    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("id, name, status")
      .eq("id", lead_id)
      .single();

    if (fetchError || !lead) {
      return NextResponse.json(
        { error: `Lead not found: ${lead_id}` },
        { status: 404 }
      );
    }

    const previousStatus = lead.status;

    // Update the status
    const { error: updateError } = await supabase
      .from("leads")
      .update({ status })
      .eq("id", lead_id);

    if (updateError) {
      return NextResponse.json(
        { error: `Update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Log the status change
    await supabase.from("lead_status_history").insert({
      lead_id,
      from_status: previousStatus,
      to_status: status,
    });

    return NextResponse.json({
      success: true,
      lead_id,
      name: lead.name,
      previous_status: previousStatus,
      new_status: status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body" },
      { status: 400 }
    );
  }
}
