import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/phone";

// Lightweight candidate lookup for the "merge with another card" dialog.
//   GET /api/leads/search?q=<name or phone>&exclude=<leadId>
// Returns up to 10 cards, newest first.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const exclude = request.nextUrl.searchParams.get("exclude");
  if (q.length < 2) return NextResponse.json({ leads: [] });

  const admin = getSupabaseAdmin();
  const digits = q.replace(/\D/g, "");
  const norm = digits.length >= 7 ? normalizePhone(q) : null;

  // escape PostgREST filter specials in the free-text part
  const safe = q.replace(/[,().]/g, " ").trim();
  const ors = [`name.ilike.%${safe}%`];
  if (digits.length >= 4) ors.push(`phone.ilike.%${digits}%`);
  if (norm) ors.push(`phone.eq.${norm}`);

  let query = admin
    .from("leads")
    .select("id, name, phone, status, sub_status, source, created_at")
    .or(ors.join(","))
    .order("created_at", { ascending: false })
    .limit(10);
  if (exclude) query = query.neq("id", exclude);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data ?? [] });
}
