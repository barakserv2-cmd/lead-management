import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";
import { businessAccount, sendWhatsAppMessage } from "@/lib/whatsappService";

const CATEGORIES = ["machine", "system", "other"] as const;
const CAT_LABEL: Record<string, string> = { machine: "המכונה", system: "המערכת", other: "אחר" };

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

  // Until now a report only surfaced in the 18:00 digest, so something filed at
  // 09:00 sat unseen all day — three reports of notes vanishing waited two days
  // that way. Alert immediately as well; the digest still groups the day.
  // Fire-and-forget: a WhatsApp hiccup must never fail the recruiter's submit.
  const alert = [
    `🔔 דיווח בעיה חדש · ${CAT_LABEL[category as string] ?? category}`,
    `מאת: ${user.email}`,
    "",
    text.slice(0, 600),
    "",
    "לטיפול: /feedback",
  ].join("\n");
  void sendWhatsAppMessage(
    process.env.FEEDBACK_DIGEST_PHONE ?? "0547000992",
    alert,
    businessAccount(),
    { skipGate: true }
  ).catch(() => undefined);

  return NextResponse.json({ ok: true }, { status: 201 });
}
