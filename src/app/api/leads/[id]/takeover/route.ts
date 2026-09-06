import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/api-auth";

/**
 * POST /api/leads/[id]/takeover — a recruiter takes over the conversation.
 * Raises needs_human_attention so (1) the chat box sends for real instead of
 * simulating, and (2) the screening bot stops auto-replying. Reversible via
 * the "טופל" clear-attention action.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { error } = await getSupabaseAdmin()
    .from("leads")
    .update({
      needs_human_attention: true,
      human_attention_reason: `${user.email ?? "רכז/ת"} לקח/ה שליטה על השיחה`,
      human_attention_raised_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
