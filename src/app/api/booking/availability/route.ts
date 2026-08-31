import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";

// ── חלונות זמינות ראיונות של הרכזת המחוברת ─────────────────
//   GET /api/booking/availability → החלונות שלי
//   PUT /api/booking/availability → החלפה מלאה של החלונות שלי
// כל רכזת מנהלת רק את הלוח של עצמה.

export const dynamic = "force-dynamic";

interface WindowInput {
  weekday: number;
  start_minute: number;
  end_minute: number;
  slot_minutes: number;
}

export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("availability_slots")
    .select("id, weekday, start_minute, end_minute, slot_minutes, active")
    .eq("recruiter_email", user.email)
    .order("weekday")
    .order("start_minute");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ windows: data ?? [] });
}

export async function PUT(request: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  let body: { windows?: WindowInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const windows = body.windows ?? [];
  if (windows.length > 30) {
    return NextResponse.json({ error: "יותר מדי חלונות" }, { status: 400 });
  }
  for (const w of windows) {
    if (
      !Number.isInteger(w.weekday) || w.weekday < 0 || w.weekday > 6 ||
      !Number.isInteger(w.start_minute) || w.start_minute < 0 || w.start_minute > 1439 ||
      !Number.isInteger(w.end_minute) || w.end_minute <= w.start_minute || w.end_minute > 1440 ||
      ![10, 15, 20, 30, 45, 60].includes(w.slot_minutes)
    ) {
      return NextResponse.json({ error: "חלון לא תקין" }, { status: 400 });
    }
  }

  const admin = getSupabaseAdmin();
  const { error: delErr } = await admin
    .from("availability_slots")
    .delete()
    .eq("recruiter_email", user.email);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (windows.length > 0) {
    const { error: insErr } = await admin.from("availability_slots").insert(
      windows.map((w) => ({
        recruiter_email: user.email,
        weekday: w.weekday,
        start_minute: w.start_minute,
        end_minute: w.end_minute,
        slot_minutes: w.slot_minutes,
      }))
    );
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: windows.length });
}
