// ============================================================
// ימים שבהם המשרד סגור — חגי ישראל
// ============================================================
//
// גובגט קבע ראיון טלפוני לראשון 13/09/2026 בשעה 12:30. זה ראש השנה ב׳,
// והמשרד סגור. אף אחד במערכת לא ידע שיש דבר כזה חג: מחולל החלונות הכיר רק
// ימים בשבוע, ולכן כל חג שנופל על יום עבודה רגיל נראה לו פנוי.
//
// התאריכים מחושבים מלוח השנה העברי שמובנה ב-JavaScript (ICU), ולא מטבלה
// שצריך לעדכן כל שנה ולא משירות חיצוני שיכול ליפול בדיוק כשקובעים ראיון.
// כל החישוב עובד על מחרוזות YYYY-MM-DD בשעון קיר, כמו שאר מערכת הראיונות.

/** חגים שבהם המשרד סגור לגמרי (מנהג ישראל — יום אחד, למעט ראש השנה). */
const CLOSED: Record<string, Record<number, string>> = {
  Tishri: {
    1: "ראש השנה א׳",
    2: "ראש השנה ב׳",
    10: "יום כיפור",
    15: "סוכות א׳",
    22: "שמיני עצרת ושמחת תורה",
  },
  Nisan: {
    15: "פסח א׳",
    21: "שביעי של פסח",
  },
  Sivan: {
    6: "שבועות",
  },
};

/** ערבי חג — יום עבודה קצר. ראיון אחרי הצהריים לא ייקבע. */
const HALF_DAY: Record<string, Record<number, string>> = {
  Elul: { 29: "ערב ראש השנה" },
  Tishri: {
    9: "ערב יום כיפור",
    14: "ערב סוכות",
    21: "הושענא רבה — ערב שמחת תורה",
  },
  Nisan: {
    14: "ערב פסח",
    20: "ערב שביעי של פסח",
  },
  Sivan: { 5: "ערב שבועות" },
};

/**
 * השעה שאחריה לא מציעים ראיון בערב חג. ברירת מחדל שמרנית — עדיף להציע
 * פחות מאשר לשלוח מועמד למשרד נעול.
 */
export const HALF_DAY_LAST_MINUTE = 13 * 60;

const hebrewFormatter = new Intl.DateTimeFormat("en-u-ca-hebrew", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** התאריך העברי של יום לועזי. חצות היום נבחר כדי לא ליפול על גבול. */
function hebrewDate(dateStr: string): { day: number; month: string } {
  const parts = hebrewFormatter.formatToParts(new Date(`${dateStr}T12:00:00Z`));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: Number(get("day")), month: get("month") };
}

export interface ClosureInfo {
  /** המשרד סגור כל היום — אין בכלל ראיונות */
  closed: boolean;
  /** יום קצר — ראיונות רק עד HALF_DAY_LAST_MINUTE */
  halfDay: boolean;
  /** שם החג בעברית, להצגה למשתמש */
  name: string | null;
}

const OPEN: ClosureInfo = { closed: false, halfDay: false, name: null };

// ── ימי סגירה ידניים ─────────────────────────────────────────
//
// מה שאי אפשר לגזור מהלוח העברי: יום העצמאות, יום הזיכרון, יום גישור,
// סגירה של החברה. נשמר בטבלה office_closures ונטען לכאן. הקובץ הזה נשאר
// בלי תלות בדאטהבייס בכוונה — הוא רץ גם בגובגט, שקורא את הרשימה דרך הגשר.

export interface ManualClosure {
  date: string; // YYYY-MM-DD
  name: string;
  halfDay: boolean;
}

let manual = new Map<string, ClosureInfo>();
let manualLoadedAt = 0;

/** מזין את הרשימה הידנית. נקרא מהשכבה שיודעת לקרוא אותה מהמקור. */
export function setManualClosures(rows: ManualClosure[], now = Date.now()): void {
  manual = new Map(
    rows.map((r) => [r.date, { closed: !r.halfDay, halfDay: r.halfDay, name: r.name }])
  );
  manualLoadedAt = now;
}

/** האם הרשימה הידנית ישנה מדי ויש לרענן. */
export function manualClosuresStale(ttlMs = 60_000, now = Date.now()): boolean {
  return now - manualLoadedAt > ttlMs;
}

/** מה שנטען כרגע — לבדיקות ולתצוגה. */
export function manualClosureCount(): number {
  return manual.size;
}

/** מה מצב המשרד בתאריך נתון (YYYY-MM-DD בשעון קיר). */
export function closureFor(dateStr: string): ClosureInfo {
  // סגירה ידנית גוברת: היא הוזנה במפורש על ידי אדם עבור התאריך הזה
  const override = manual.get(dateStr);
  if (override) return override;

  const { day, month } = hebrewDate(dateStr);
  const closedName = CLOSED[month]?.[day];
  if (closedName) return { closed: true, halfDay: false, name: closedName };
  const halfName = HALF_DAY[month]?.[day];
  if (halfName) return { closed: false, halfDay: true, name: halfName };
  return OPEN;
}

/** קיצור: האם אסור לקבוע כלום ביום הזה. */
export function isClosedDay(dateStr: string): boolean {
  return closureFor(dateStr).closed;
}

/**
 * האם מותר לקבוע ראיון בתאריך ובדקה נתונים.
 * `minute` הוא דקות מתחילת היום בשעון קיר ישראלי.
 */
export function isBookableMinute(dateStr: string, minute: number): boolean {
  const c = closureFor(dateStr);
  if (c.closed) return false;
  if (c.halfDay && minute >= HALF_DAY_LAST_MINUTE) return false;
  return true;
}

/** ימי הסגירה בטווח — לתצוגה ולבדיקות. */
export function closuresBetween(
  fromDateStr: string,
  days: number
): { date: string; info: ClosureInfo }[] {
  const out: { date: string; info: ClosureInfo }[] = [];
  const start = new Date(`${fromDateStr}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const info = closureFor(d);
    if (info.closed || info.halfDay) out.push({ date: d, info });
  }
  return out;
}
