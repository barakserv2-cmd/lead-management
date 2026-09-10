import { getSupabaseAdmin } from "@/lib/api-auth";
import {
  setManualClosures,
  manualClosuresStale,
  type ManualClosure,
} from "@/lib/israelHolidays";

/**
 * טעינת ימי הסגירה הידניים מהדאטהבייס אל מנוע החגים.
 *
 * israelHolidays.ts נשאר בלי תלות בדאטהבייס — הוא רץ גם בגובגט, שקורא את
 * אותה רשימה דרך הגשר. כאן השכבה שיודעת מאיפה היא מגיעה ב-v1.
 *
 * נטען דרך service role: הרשימה לא סודית, וכל נתיב שקובע ראיון חייב אותה
 * גם כשהוא רץ בלי משתמש מחובר (הגשר, הקרונים).
 */
export async function ensureClosuresLoaded(ttlMs = 60_000): Promise<void> {
  if (!manualClosuresStale(ttlMs)) return;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("office_closures")
      .select("closure_date, name, half_day")
      .order("closure_date", { ascending: true })
      .limit(2000);
    if (error) return; // נשארים עם מה שכבר טעון — עדיף מלהיפתח לגמרי
    setManualClosures(
      (data ?? []).map((r) => ({
        date: String(r.closure_date).slice(0, 10),
        name: (r.name as string) ?? "סגור",
        halfDay: !!r.half_day,
      }))
    );
  } catch {
    // הדאטהבייס לא זמין — לא מרוקנים את הרשימה הקיימת
  }
}

export type { ManualClosure };
