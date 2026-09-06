import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";

const CATEGORIES = ["machine", "system", "other"] as const;

/** GET /api/feedback — admin sees all reports; a recruiter sees their own. */
export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  let q = getSupabaseAdmin()
    .from("recruiter_feedback")
    .select("id, author, category, body, status, handled_by, handled_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!user.isAdmin) q = q.ilike("author", user.email);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [], isAdmin: user.isAdmin });
}

/** POST /api/feedback — any signed-in recruiter files a report. */
export async function POST(req: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  let body: { category?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "נא לכתוב את הבעיה" }, { status: 400 });
  const category = CATEGORIES.includes(body.category as (typeof CATEGORIES)[number])
    ? body.category
    : "other";

  const { error } = await getSupabaseAdmin().from("recruiter_feedback").insert({
    author: user.email,
    category,
    body: text.slice(0, 2000),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
