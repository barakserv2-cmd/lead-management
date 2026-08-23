// ולידציה לשעת ראיון — השעה היא מועד ההגעה של המועמד למשרד.
// חוסם הזנות שגויות (תאריך בלי שעה → 00:00, שעות לילה) לפני שהן נשמרות.
export const INTERVIEW_HOUR_MIN = 6;
export const INTERVIEW_HOUR_MAX = 16;

/** מקבל ערך datetime-local ("YYYY-MM-DDTHH:mm"). מחזיר הודעת שגיאה או null. */
export function validateInterviewLocal(value: string): string | null {
  if (!value) return null;
  const m = /T(\d{2}):(\d{2})/.exec(value);
  if (!m) return "חסרה שעת הגעה — הזיני תאריך ושעה";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h === 0 && min === 0) return "חסרה שעת הגעה — 00:00 לא תקין";
  if (h < INTERVIEW_HOUR_MIN || h >= INTERVIEW_HOUR_MAX) {
    return `שעת הגעה ${m[1]}:${m[2]} מחוץ לשעות הפעילות (${String(INTERVIEW_HOUR_MIN).padStart(2, "0")}:00–${INTERVIEW_HOUR_MAX}:00)`;
  }
  return null;
}
