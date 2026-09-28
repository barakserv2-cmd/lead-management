"use client";

import { useSyncExternalStore } from "react";

/**
 * החלונות הפתוחים של המועמדים — מצב אחד לכל המערכת.
 *
 * למה זה חי מחוץ ל-React: הרשימה נפתחת מתוך *העמוד* (טבלת הלידים, חיפוש
 * מהיר, דף אחר), והחלונות עצמם מרונדרים ב-*לייאאוט*. אלה שני עצי רינדור
 * שונים שאינם רואים זה את זה, אז המצב חייב לשבת ביניהם.
 *
 * הבעיה שזה פותר (דיווח הרכזות, 28.09): רכזת עובדת על מועמדת, נכנסת
 * שיחה, וכדי לדעת מי מתקשר היא מנווטת — וכל מה שהיה פתוח נעלם. אחרי
 * השיחה היא מתחילה מאפס. הגרסה הקודמת החזיקה את החלונות בעמוד הלידים
 * בלבד; כאן הם שורדים גם מעבר בין דפים.
 *
 * sessionStorage ולא localStorage, בכוונה: החלונות שייכים לישיבת העבודה
 * הנוכחית. שורדים ניווט ורענון, נעלמים כשסוגרים את הלשונית — כך שבבוקר
 * לא קופצים חלונות של אתמול.
 */

const KEY = "leadWindows:v1";
export const MAX_WINDOWS = 4;

export interface WindowState {
  ids: string[];
  /** חלונות שנפתחו בגלל הודעה נכנסת — נפתחים ישר על טאב הצ'אט */
  chatFirst: string[];
}

const EMPTY: WindowState = { ids: [], chatFirst: [] };

/** קריאה עמידה: אחסון חסום, JSON פגום או מבנה ישן לא מפילים את העמוד. */
export function parseState(raw: string | null): WindowState {
  if (!raw) return EMPTY;
  try {
    const p = JSON.parse(raw) as Partial<WindowState>;
    const ids = Array.isArray(p.ids)
      ? p.ids.filter((x): x is string => typeof x === "string").slice(0, MAX_WINDOWS)
      : [];
    const chatFirst = Array.isArray(p.chatFirst)
      ? p.chatFirst.filter((x): x is string => typeof x === "string" && ids.includes(x))
      : [];
    return { ids, chatFirst };
  } catch {
    return EMPTY;
  }
}

/** פתיחה: קיים → ללא שינוי; מלא → הוותיק ביותר נדחק החוצה. */
export function addWindow(ids: string[], id: string, max = MAX_WINDOWS): string[] {
  if (ids.includes(id)) return ids;
  if (ids.length >= max) return [...ids.slice(ids.length - max + 1), id];
  return [...ids, id];
}

let state: WindowState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function persist() {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // מצב פרטי / אחסון מלא — החלונות פשוט לא ישרדו ניווט, לא נופלים בגללו
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    state = parseState(window.sessionStorage.getItem(KEY));
  } catch {
    state = EMPTY;
  }
}

function setState(next: WindowState) {
  state = next;
  persist();
  emit();
}

export function openLeadWindow(id: string, opts?: { chatFirst?: boolean }) {
  hydrate();
  const ids = addWindow(state.ids, id);
  const chatFirst = opts?.chatFirst && !state.chatFirst.includes(id)
    ? [...state.chatFirst, id]
    : state.chatFirst;
  if (ids === state.ids && chatFirst === state.chatFirst) return;
  setState({ ids, chatFirst: chatFirst.filter((x) => ids.includes(x)) });
}

export function closeLeadWindow(id: string) {
  hydrate();
  if (!state.ids.includes(id)) return;
  const ids = state.ids.filter((x) => x !== id);
  setState({ ids, chatFirst: state.chatFirst.filter((x) => ids.includes(x)) });
}

export function useLeadWindows(): WindowState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => {
      hydrate();
      return state;
    },
    // בשרת אין sessionStorage — הרינדור הראשוני תמיד ריק, והלקוח משלים
    () => EMPTY
  );
}
