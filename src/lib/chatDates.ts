// ============================================================
// תאריכים בצ'אט — כמו בוואטסאפ: כותרת יום בין ימים, שעה על כל הודעה
// ============================================================
//
// דיווח של חושן (29.09): "כל צ'אט בוואטסאפ דרך המערכת לא כותב מאיזה תאריך
// השיחה, רק איזה שעה". בשיחה שנמשכת כמה ימים אי אפשר היה לדעת אם "מגיעה
// מחר" נכתב אתמול או לפני שבוע.
//
// created_at של הודעה הוא רגע אמיתי (UTC), לא שעון קיר כמו interview_date,
// ולכן מציגים אותו בשעון ישראל במפורש — לא לפי אזור הזמן של הדפדפן.

const TZ = "Asia/Jerusalem";
const WEEKDAYS = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** היום (YYYY-MM-DD) שבו הרגע הזה נופל, בשעון ישראל. */
export function israelDayKey(at: string | Date): string {
  return dayFmt.format(new Date(at));
}

function keyToUtcMidnight(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * הכותרת שמעל הודעות של יום אחד: "היום", "אתמול", שם היום בשבוע האחרון,
 * ואחרת התאריך המלא.
 */
export function chatDayLabel(at: string | Date, now: Date = new Date()): string {
  const key = israelDayKey(at);
  const daysAgo = Math.round((keyToUtcMidnight(israelDayKey(now)) - keyToUtcMidnight(key)) / 86_400_000);
  if (daysAgo === 0) return "היום";
  if (daysAgo === 1) return "אתמול";
  if (daysAgo > 1 && daysAgo < 7) return WEEKDAYS[new Date(keyToUtcMidnight(key)).getUTCDay()];
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

/** השעה שעל ההודעה, בשעון ישראל. */
export function chatTime(at: string | Date): string {
  return timeFmt.format(new Date(at));
}

/** תאריך ושעה מלאים — לריחוף מעל השעה. */
export function chatFullDateTime(at: string | Date): string {
  const key = israelDayKey(at);
  const [y, m, d] = key.split("-");
  return `${WEEKDAYS[new Date(keyToUtcMidnight(key)).getUTCDay()]}, ${d}.${m}.${y} ${chatTime(at)}`;
}
