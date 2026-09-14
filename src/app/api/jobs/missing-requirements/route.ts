import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";

// המשרות שגובגט לא יכול לתאר, ומילוי מהיר שלהן.
//
// גובגט קורא את requirements ואת notes ומרכיב מהן את מה שהוא אומר למועמד.
// משרה בלי שתיהן מקבלת "הדרישות ייסקרו איתך בראיון" — נכון, אבל חלש מול
// מועמד ששואל מה צריך. 35 משרות פתוחות היו במצב הזה.

/** ערך שנחשב "מלא": לא ריק ולא מקף בודד. */
function filled(v: unknown): boolean {
  const s = typeof v === "string" ? v.trim() : Array.isArray(v) ? v.join("").trim() : "";
  return s.length > 0 && /[\p{L}\p{N}]/u.test(s);
}

export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  const db = getSupabaseAdmin();
  const [{ data: jobs, error }, { data: clients }] = await Promise.all([
    db.from("jobs")
      .select("id, title, location, pay_rate, needed_count, requirements, notes, client_id")
      .eq("status", "Open")
      .limit(500),
    db.from("clients").select("id, name"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const names = new Map((clients ?? []).map((c) => [c.id, c.name as string]));
  const rows = (jobs ?? []).map((j) => ({
    id: j.id as string,
    title: (j.title as string) ?? "",
    location: (j.location as string) ?? "",
    pay_rate: (j.pay_rate as string) ?? "",
    needed: (j.needed_count as number) ?? null,
    client: j.client_id ? names.get(j.client_id as string) ?? "" : "",
    requirements: Array.isArray(j.requirements)
      ? (j.requirements as unknown[]).join(" · ")
      : (j.requirements as string) ?? "",
    notes: (j.notes as string) ?? "",
    missing: !filled(j.requirements) && !filled(j.notes),
  }));

  rows.sort((a, b) => Number(b.missing) - Number(a.missing) || a.client.localeCompare(b.client, "he"));
  return NextResponse.json({ jobs: rows, missing: rows.filter((r) => r.missing).length });
}

/** שמירה של דרישות למשרה אחת. */
export async function PATCH(req: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  let body: { id?: string; requirements?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const text = (body.requirements ?? "").trim();
  if (!body.id) return NextResponse.json({ error: "חסר מזהה משרה" }, { status: 400 });
  if (!filled(text)) {
    return NextResponse.json({ error: "צריך לכתוב דרישה אמיתית, לא מקף" }, { status: 400 });
  }

  // נשמר כמערך — זה מה שסנכרון המשרות לגובגט מצפה לו
  const { error } = await getSupabaseAdmin()
    .from("jobs")
    .update({ requirements: text.split(/\s*·\s*|\s*\n\s*/).filter(Boolean) })
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
