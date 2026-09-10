import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, requireAdmin, getSupabaseAdmin } from "@/lib/api-auth";
import { setManualClosures, closureFor } from "@/lib/israelHolidays";
import { ensureClosuresLoaded } from "@/lib/closures";

// ימי סגירה ידניים של המשרד. חגי ישראל מחושבים בקוד ולא נשמרים כאן —
// הטבלה מיועדת למה שאי אפשר לגזור מהלוח: יום העצמאות, יום הזיכרון,
// יום גישור, סגירה של החברה.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** רשימת הסגירות — כל רכזת רשאית לראות מתי סגור. */
export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("office_closures")
    .select("id, closure_date, name, half_day, created_by, created_at")
    .order("closure_date", { ascending: true })
    .limit(2000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ closures: data ?? [], isAdmin: user.isAdmin });
}

/** הוספת יום סגירה — אדמין בלבד. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: { date?: string; name?: string; halfDay?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const date = (body.date ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "תאריך לא תקין" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "צריך שם ליום הסגירה" }, { status: 400 });

  // תאריך שכבר סגור מהלוח העברי — אין טעם להוסיף אותו ידנית
  await ensureClosuresLoaded(0);
  const existing = closureFor(date);
  if (existing.closed && existing.name) {
    return NextResponse.json(
      { error: `${date} כבר סגור: ${existing.name}` },
      { status: 409 }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("office_closures")
    .insert({
      closure_date: date,
      name,
      half_day: !!body.halfDay,
      created_by: auth.email,
    })
    .select("id, closure_date, name, half_day, created_by, created_at")
    .single();

  if (error) {
    const dup = error.message.includes("duplicate") || error.code === "23505";
    return NextResponse.json(
      { error: dup ? "התאריך הזה כבר ברשימה" : error.message },
      { status: dup ? 409 : 500 }
    );
  }

  // הרשימה בזיכרון מתרעננת מיד, כדי שהחסימה תחול על ההזמנה הבאה ולא בעוד דקה
  setManualClosures([], 0);
  await ensureClosuresLoaded(0);

  return NextResponse.json({ closure: data }, { status: 201 });
}

/** מחיקת יום סגירה — אדמין בלבד. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  const { error } = await getSupabaseAdmin()
    .from("office_closures")
    .delete()
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  setManualClosures([], 0);
  await ensureClosuresLoaded(0);

  return NextResponse.json({ ok: true });
}
