"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * החלונות הפתוחים של המועמדים, ששורדים ניווט.
 *
 * הבעיה שזה פותר (דיווח הרכזות, 28.09): רכזת פותחת שניים-שלושה מועמדים
 * בחלונות הצפים, מתחילה לכתוב הערה — ואז נכנסת שיחה. כדי לדעת מי מתקשר
 * היא מחפשת את המספר, והחיפוש עושה `router.push` ל-`/leads?...`. הניווט
 * מרכיב מחדש את `leads-content`, `openLeadIds` חוזר ל-[], **וכל החלונות
 * נעלמים**. אחרי השיחה היא מתחילה מאפס: לחפש שוב את המועמדת, לפתוח שוב
 * את הכרטיס, למצוא שוב איפה הייתה.
 *
 * הטקסט שהיא הקלידה כבר שרד (ראו useNoteDraft) — מה שלא שרד הוא **המקום
 * שבו היא עמדה**. זה מה שהוקפץ כאן.
 *
 * sessionStorage ולא localStorage, בכוונה: החלונות שייכים לישיבת העבודה
 * הנוכחית. הם שורדים ניווט ורענון — ונעלמים כשסוגרים את הלשונית, כך
 * שבבוקר לא קופצים חלונות של אתמול.
 */

const KEY = "leadWindows:v1";
const MAX_WINDOWS = 4;

interface Stored {
  ids: string[];
  chatFirst: string[];
}

/** קריאה עמידה: אחסון חסום, JSON פגום או מבנה ישן לא מפילים את העמוד. */
export function readStored(raw: string | null): Stored {
  if (!raw) return { ids: [], chatFirst: [] };
  try {
    const p = JSON.parse(raw) as Partial<Stored>;
    const ids = Array.isArray(p.ids) ? p.ids.filter((x) => typeof x === "string").slice(0, MAX_WINDOWS) : [];
    const chatFirst = Array.isArray(p.chatFirst) ? p.chatFirst.filter((x) => typeof x === "string") : [];
    // סימון "פתח על הצ'אט" רלוונטי רק לחלון שבאמת פתוח
    return { ids, chatFirst: chatFirst.filter((x) => ids.includes(x)) };
  } catch {
    return { ids: [], chatFirst: [] };
  }
}

/** פתיחת חלון: קיים → ללא שינוי; מלא → הוותיק ביותר נדחק החוצה. */
export function addWindow(ids: string[], id: string, max = MAX_WINDOWS): string[] {
  if (ids.includes(id)) return ids;
  if (ids.length >= max) return [...ids.slice(ids.length - max + 1), id];
  return [...ids, id];
}

export function useOpenLeadWindows() {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [chatFirstIds, setChatFirstIds] = useState<Set<string>>(new Set());
  // עד שהשחזור מ-sessionStorage קרה, אסור לכתוב חזרה — אחרת הרינדור
  // הראשון (ריק) דורס את מה שנשמר לפני הניווט.
  const hydrated = useRef(false);

  useEffect(() => {
    let stored: Stored = { ids: [], chatFirst: [] };
    try {
      stored = readStored(window.sessionStorage.getItem(KEY));
    } catch {
      // מצב פרטי / אחסון חסום — פשוט מתחילים ריק
    }
    setOpenIds(stored.ids);
    setChatFirstIds(new Set(stored.chatFirst));
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.sessionStorage.setItem(
        KEY,
        JSON.stringify({ ids: openIds, chatFirst: [...chatFirstIds] } satisfies Stored)
      );
    } catch {
      // אחסון מלא או חסום — החלונות פשוט לא ישרדו ניווט, לא נופלים בגללו
    }
  }, [openIds, chatFirstIds]);

  const open = useCallback((id: string, opts?: { chatFirst?: boolean }) => {
    setOpenIds((prev) => addWindow(prev, id));
    if (opts?.chatFirst) setChatFirstIds((prev) => new Set(prev).add(id));
  }, []);

  const close = useCallback((id: string) => {
    setOpenIds((prev) => prev.filter((x) => x !== id));
    setChatFirstIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { openIds, chatFirstIds, open, close, hydrated };
}
