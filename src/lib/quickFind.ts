"use client";

/**
 * פתיחת החיפוש המהיר מכל מקום במערכת.
 *
 * למה זה קיים: הכפתור יושב ב-Header והשכבה עצמה מרונדרת בלייאאוט —
 * שני עצי רינדור שונים. אותו דפוס כמו lib/leadWindows.ts.
 *
 * ולמה בכלל צריך כפתור ולא רק Ctrl+K: **בטאבלט אין Ctrl.** קיצור מקלדת
 * לבדו הופך את התכונה לבלתי קיימת בחצי מהמכשירים, ולבלתי נראית בכולם —
 * סער שאל "איפה אני אמור לראות את החלונות?" וזו בדיוק התשובה.
 */

const listeners = new Set<() => void>();

export function openQuickFind() {
  for (const fn of listeners) fn();
}

export function onQuickFind(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
