import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";

const MISSING = ["פרטי שכר", "שם המעסיק", "עוד משרות", "דרישות התפקיד", "מדיניות/תנאים", "מיקום מדויק", "אחר"];

/** GET /api/survey — admin sees all responses + averages; a recruiter sees own. */
export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });
  let q = getSupabaseAdmin()
    .from("recruiter_survey")
    .select("id, author, job_relevance, job_accuracy, conversation, missing, comment, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!user.isAdmin) q = q.ilike("author", user.email);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = data ?? [];
  const avg = (k: "job_relevance" | "job_accuracy" | "conversation") => {
    const v = items.map((i) => i[k]).filter((x): x is number => typeof x === "number");
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
  };
  const missingCounts: Record<string, number> = {};
  for (const i of items) for (const m of i.missing ?? []) missingCounts[m] = (missingCounts[m] ?? 0) + 1;

  return NextResponse.json({
    items,
    isAdmin: user.isAdmin,
    count: items.length,
    averages: { job_relevance: avg("job_relevance"), job_accuracy: avg("job_accuracy"), conversation: avg("conversation") },
    missingCounts,
  });
}

/** POST /api/survey — a recruiter submits a response. */
export async function POST(req: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });
  let b: { job_relevance?: number; job_accuracy?: number; conversation?: number; missing?: string[]; comment?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }

  const clamp = (n: unknown) => (typeof n === "number" && n >= 1 && n <= 5 ? n : null);
  const missing = Array.isArray(b.missing) ? b.missing.filter((m) => MISSING.includes(m)) : [];
  const { error } = await getSupabaseAdmin().from("recruiter_survey").insert({
    author: user.email,
    job_relevance: clamp(b.job_relevance),
    job_accuracy: clamp(b.job_accuracy),
    conversation: clamp(b.conversation),
    missing,
    comment: (b.comment ?? "").trim().slice(0, 2000) || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
