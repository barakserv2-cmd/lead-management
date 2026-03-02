import { NextRequest, NextResponse } from "next/server";
import { validateApiKey, unauthorizedResponse, getSupabaseAdmin } from "@/lib/api-auth";
import { LEAD_STATUSES } from "@/lib/constants";

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  try {
    const supabase = getSupabaseAdmin();

    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");
    const status = request.nextUrl.searchParams.get("status") || LEAD_STATUSES.NEW_LEAD;

    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, phone, email, location, experience, age, job_title, source, status, notes, created_at")
      .eq("status", status)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("[API /leads/pending] Supabase error:", error);
      return NextResponse.json(
        { error: `Query failed: ${error.message}`, code: error.code, details: error.details },
        { status: 500 }
      );
    }

    return NextResponse.json({
      total: leads?.length || 0,
      leads: leads || [],
    });
  } catch (error) {
    console.error("[API /leads/pending] Unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
