import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/api-auth";

// Merge two duplicate lead cards into one (see merge_leads() in migration 00043).
// Winner = the card further along the pipeline; the loser is deleted after all
// its child rows (history, events, notes, messages, …) move to the winner.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { leadId?: string; duplicateId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.leadId || !body.duplicateId) {
    return NextResponse.json({ error: "חסר מזהה ליד או כפיל" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("merge_leads", {
    a: body.leadId,
    b: body.duplicateId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ winnerId: data });
}
