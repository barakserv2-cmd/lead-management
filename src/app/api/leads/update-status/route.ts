import { NextRequest, NextResponse } from "next/server";
import { validateApiKey, unauthorizedResponse } from "@/lib/api-auth";
import { changeLeadStatus } from "@/lib/actions/changeLeadStatus";
import { isValidStatus, ALL_STATUSES, type LeadStatusValue } from "@/lib/stateMachine";

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { lead_id, status, notes, user_id } = body;

    if (!lead_id || !status) {
      return NextResponse.json(
        { error: "Missing required fields: lead_id, status" },
        { status: 400 }
      );
    }

    if (!isValidStatus(status)) {
      return NextResponse.json(
        { error: `Invalid status. Valid values: ${ALL_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await changeLeadStatus({
      leadId: lead_id,
      newStatus: status as LeadStatusValue,
      userId: user_id ?? "api",
      notes: notes ?? undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      lead_id,
      new_status: status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body" },
      { status: 400 }
    );
  }
}
