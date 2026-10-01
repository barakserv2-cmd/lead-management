import type { SupabaseClient } from "@supabase/supabase-js";
import { alertAdmin } from "@/lib/adminAlert";

// ============================================================
// ניטור בריאות ערוצי הלידים — ועדת נפח הלידים 12.09, החלטה 3.
//
// הרקע: סריקת הג'ימייל תלויה במילות מפתח ובפורמט של הספק. כשספק
// שינה פורמט — ערוץ שלם מת בשקט ואף אחד לא שם לב (AllJobs ירד
// לאפס בלי שום התראה). מעכשיו: ערוץ שהיה פעיל ב-14 הימים האחרונים
// ונדם — התראת וואטסאפ לסער.
//
// מתי מתריעים: לפחות 3 ימי שקט, וגם בקצב של הערוץ היו מצופים בהם
// לפחות 5 לידים (rate*silentDays >= 5). כך ערוץ של 2 לידים ביום
// מתריע אחרי ~3 ימים, וערוץ איטי של ליד ביומיים לא מציף בשווא.
// אידמפוטנטיות: occurrence_key לכל (ערוץ, תאריך הליד האחרון) —
// התראה אחת לכל אפיזודת שקט, גם כשהקרון רץ כל שעה.
// ============================================================

const SILENT_DAYS_MIN = 3;
const EXPECTED_MISSED_MIN = 5;
const WINDOW_DAYS = 14;
const CHECK_HOUR_ISRAEL = 9; // בדיקה אחת ביום, בבוקר עבודה

export interface IntakeMonitorSummary {
  channels: number;
  alerts: number;
  purged: number;
  details: string[];
}

function israelHour(at: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour12: false,
    hour: "2-digit",
  }).format(at);
  return Number(h) % 24;
}

export async function runIntakeMonitor(db: SupabaseClient): Promise<IntakeMonitorSummary> {
  const summary: IntakeMonitorSummary = { channels: 0, alerts: 0, purged: 0, details: [] };
  const now = new Date();
  if (israelHour(now) !== CHECK_HOUR_ISRAEL) {
    summary.details.push(`מחוץ לשעת הבדיקה (${CHECK_HOUR_ISRAEL}:00)`);
    return summary;
  }

  // ── רטנציה: "פניות ללא ליד" נמחקות אחרי 90 יום ──────────────
  // אלה טלפונים של אנשים שאינם לידים — אין סיבה להחזיק אותם לנצח
  // (שכבת הפרטיות של המערכת עובדת באותו עיקרון על לידים).
  const purgeBefore = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: purgedRows } = await db
    .from("unmatched_inbound")
    .delete()
    .lt("last_at", purgeBefore)
    .select("id");
  summary.purged = purgedRows?.length ?? 0;

  // ── בריאות ערוצים ───────────────────────────────────────────
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent, error } = await db
    .from("leads")
    .select("source, created_at")
    .gte("created_at", windowStart)
    .limit(5000);
  if (error) {
    summary.details.push(`שגיאת שליפה: ${error.message}`);
    return summary;
  }

  const bySource = new Map<string, { count: number; lastAt: string }>();
  for (const row of recent ?? []) {
    const source = String(row.source ?? "אחר");
    const createdAt = String(row.created_at);
    const cur = bySource.get(source);
    if (!cur) bySource.set(source, { count: 1, lastAt: createdAt });
    else {
      cur.count++;
      if (createdAt > cur.lastAt) cur.lastAt = createdAt;
    }
  }
  summary.channels = bySource.size;

  for (const [source, { count, lastAt }] of bySource) {
    const silentDays = (now.getTime() - new Date(lastAt).getTime()) / (24 * 60 * 60 * 1000);
    const rate = count / WINDOW_DAYS;
    if (silentDays < SILENT_DAYS_MIN || rate * silentDays < EXPECTED_MISSED_MIN) continue;

    const key = `channel-silent:${source}:${lastAt.slice(0, 10)}`;
    const { error: claimErr } = await db.from("cron_reminders").insert({
      reminder_type: "channel_silent",
      occurrence_key: key,
      payload: { source, count_14d: count, last_lead_at: lastAt },
    });
    if (claimErr) continue; // 23505 — כבר התרענו על האפיזודה הזו

    const days = Math.floor(silentDays);
    const alertMsg =
      `📉 ערוץ לידים נדם — "${source}"\n` +
      `ב-14 הימים האחרונים: ${count} לידים, אבל אפס כבר ${days} ימים ` +
      `(האחרון: ${new Date(lastAt).toLocaleDateString("he-IL")}).\n` +
      `שווה לבדוק: קמפיין שנעצר, תקציב שנגמר, או ספק ששינה פורמט מייל.`;
    const res = await alertAdmin({
      title: "ערוץ לידים נדם",
      subject: source,
      reason: `${count} לידים ב-14 הימים האחרונים, ואפס כבר ${days} ימים. לבדוק קמפיין, תקציב או פורמט מייל.`,
      text: alertMsg,
    });
    if (res.sent) {
      summary.alerts++;
      summary.details.push(`התראה: ${source} שקט ${days} ימים`);
    } else {
      // ההתראה לא יצאה — משחררים את המפתח כדי שהריצה של מחר תנסה שוב
      await db.from("cron_reminders").delete().eq("occurrence_key", key);
      summary.details.push(`שליחת התראה נכשלה (${source}): ${res.error}`);
    }
  }

  return summary;
}
