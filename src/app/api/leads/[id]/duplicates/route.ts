import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/api-auth";

// Other lead cards that look like the same candidate (same last-9 phone digits).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("find_lead_duplicates", { p_lead_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ duplicates: data ?? [] });
}
