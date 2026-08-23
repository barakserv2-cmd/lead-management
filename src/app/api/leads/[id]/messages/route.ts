import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { getMessageScope, scopeFilter } from "@/lib/messageVisibility";

// GET /api/leads/[id]/messages — the lead's chat, limited to conversations the
// signed-in recruiter may see (business number + their own personal number;
// admins see everything).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieClient = await createCookieClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = await getMessageScope(user.email);
  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let q = admin
    .from("messages")
    .select("id, role, content, created_at, sent_by, via_instance")
    .eq("lead_id", id)
    .order("created_at", { ascending: true });
  const f = scopeFilter(scope);
  if (f) q = q.or(f);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [], scope: scope.all ? "all" : "own" });
}
