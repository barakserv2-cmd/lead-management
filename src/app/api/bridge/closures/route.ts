import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/api-auth";

/**
 * GET /api/bridge/closures — ימי הסגירה הידניים, לגובגט.
 *
 * גובגט רץ בפריסה נפרדת עם דאטהבייס משלו, ולכן הוא לא יכול לקרוא את הטבלה
 * ישירות. בלי הנתיב הזה הוא היה מציע למועמד מועד ביום שסער סגר ידנית, והליד
 * היה נדחה רק בכתיבה חזרה — אחרי שהמועמד כבר בחר שעה.
 *
 * אותו אימות כמו שאר הגשר: x-machine-key.
 */
export async function GET(req: NextRequest) {
  const key = process.env.MACHINE_BRIDGE_KEY;
  if (!key || req.headers.get("x-machine-key") !== key) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // רק מהיום והלאה — לגובגט אין שימוש בהיסטוריה, והתשובה נשארת קטנה
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

  const { data, error } = await getSupabaseAdmin()
    .from("office_closures")
    .select("closure_date, name, half_day")
    .gte("closure_date", today)
    .order("closure_date", { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    closures: (data ?? []).map((r) => ({
      date: String(r.closure_date).slice(0, 10),
      name: (r.name as string) ?? "סגור",
      halfDay: !!r.half_day,
    })),
  });
}
