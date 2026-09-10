import { NextResponse } from "next/server";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";

/**
 * GET /api/feedback/open-count — how many reports are still waiting.
 *
 * Feeds the badge next to "דיווח בעיות" in the sidebar. A recruiter sees the
 * count of her own open reports (so she can tell whether hers was picked up);
 * an admin sees everyone's.
 */
export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ open: 0 });

  let q = getSupabaseAdmin()
    .from("recruiter_feedback")
    .select("id", { count: "exact", head: true })
    .neq("status", "handled");
  if (!user.isAdmin) q = q.ilike("author", user.email);

  const { count, error } = await q;
  if (error) return NextResponse.json({ open: 0 });
  return NextResponse.json({ open: count ?? 0 });
}
