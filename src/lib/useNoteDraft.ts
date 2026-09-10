"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * טיוטת הערה ששורדת סגירה של החלונית.
 *
 * שלוש רכזות דיווחו שהערות "נמחקות". בבדיקה התברר שהן לא נמחקו — הן מעולם
 * לא נשלחו: כל תיבות ההערות נשמרות רק בלחיצה על "שמור", והטקסט עד אז יושב
 * בזיכרון של הקומפוננטה. כרטיס הליד הוא חלונית נשלפת, ו-Esc / קליק בחוץ /
 * router.refresh() אחרי שינוי סטטוס מפרקים אותה — והטקסט הולך בלי אזהרה
 * ובלי שנשלחה ולו בקשה אחת.
 *
 * הפתרון: מה שמוקלד נשמר מיד בדפדפן, ומוחזר כשהתיבה נפתחת שוב. זה לא
 * תחליף לשמירה בשרת — הטיוטה אישית ולא מגיעה לרכזת אחרת — אבל מכאן טקסט
 * ארוך כבר לא נעלם בגלל קליק.
 */

const PREFIX = "leadNoteDraft:";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null; // חלון פרטי / אחסון חסום — פשוט אין טיוטה
  }
}

function write(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(PREFIX + key, value);
    else window.localStorage.removeItem(PREFIX + key);
  } catch {
    // אין מקום או אין הרשאה — ההקלדה ממשיכה כרגיל
  }
}

export interface NoteDraft {
  value: string;
  setValue: (next: string) => void;
  /** נקרא אחרי שמירה מוצלחת בשרת — מנקה את הטיוטה המקומית */
  commit: () => void;
  /** נקרא כשהמשתמשת ביטלה במפורש */
  discard: () => void;
  /** האם יש טקסט שלא נשמר בשרת */
  dirty: boolean;
  /** האם הטקסט הנוכחי שוחזר מטיוטה שנשארה מפעם קודמת */
  restored: boolean;
}

/**
 * @param key   מזהה יציב לתיבה — בדרך כלל `${leadId}:notes`
 * @param saved הערך שכבר שמור בשרת; טיוטה גוברת עליו רק אם היא שונה ממנו
 */
export function useNoteDraft(key: string, saved: string): NoteDraft {
  const [value, setValueState] = useState(saved);
  const [restored, setRestored] = useState(false);

  // localStorage לא קיים ברינדור בשרת, ולכן השחזור קורה אחרי ההרכבה
  useEffect(() => {
    const stored = read(key);
    if (stored !== null && stored !== saved) {
      setValueState(stored);
      setRestored(true);
    }
    // כשעוברים לליד אחר מתחילים מחדש מהערך השמור
    else setValueState(saved);
  }, [key, saved]);

  const setValue = useCallback(
    (next: string) => {
      setValueState(next);
      write(key, next === saved ? "" : next);
    },
    [key, saved]
  );

  const commit = useCallback(() => {
    write(key, "");
    setRestored(false);
  }, [key]);

  const discard = useCallback(() => {
    write(key, "");
    setValueState(saved);
    setRestored(false);
  }, [key, saved]);

  const dirty = value.trim() !== saved.trim();

  // אזהרה לפני סגירת הטאב או ניווט מלא — הדפדפן מציג את הדיאלוג שלו
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return { value, setValue, commit, discard, dirty, restored };
}
