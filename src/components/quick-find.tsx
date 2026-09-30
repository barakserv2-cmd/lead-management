"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STATUS_LABELS } from "@/lib/stateMachine";
import type { LeadStatusValue } from "@/lib/stateMachine";
import { openLeadWindow } from "@/lib/leadWindows";
import { onQuickFind } from "@/lib/quickFind";

/**
 * חיפוש מהיר — Ctrl+K.
 *
 * זו התשובה הישירה לתלונה: נכנסת שיחה, והרכזת צריכה לדעת מי מתקשר.
 * עד היום הדרך היחידה הייתה שורת החיפוש בעמוד הלידים, שעושה ניווט —
 * וכל מה שהיה פתוח נמחק. כאן היא מקלידה מספר, לוחצת Enter, והמועמד/ת
 * נפתח/ת כחלון נוסף **בלי לזוז מהמסך שהיא עליו**.
 *
 * הדפוס שאול מ-Cmd+K של Linear/Slack: שכבה מעל, מקלדת בלבד, לא מנווט.
 */

interface Hit {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  source: string | null;
}

const DEBOUNCE_MS = 200;

export function QuickFind() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // הכפתור בסרגל העליון — הדרך היחידה שעובדת גם בטאבלט
  useEffect(() => onQuickFind(() => setOpen(true)), []);

  // Ctrl+K / Cmd+K מכל מקום במערכת
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setCursor(0);
      // המיקוד אחרי שהשכבה באמת על המסך
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/leads/search?q=${encodeURIComponent(term)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { leads?: Hit[] };
        if (cancelled) return;
        setHits(data.leads ?? []);
        setCursor(0);
      } catch {
        // רשת נפלה — הרשימה פשוט תישאר כפי שהיא
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const pick = useCallback((hit: Hit) => {
    openLeadWindow(hit.id);
    setOpen(false);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && hits[cursor]) { e.preventDefault(); pick(hits[cursor]); }
  }

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="מי מתקשר? שם או מספר טלפון…"
          className="w-full px-4 py-3.5 text-base outline-none border-b border-gray-100"
        />

        {q.trim().length >= 2 && (
          <ul className="max-h-80 overflow-y-auto">
            {hits.map((h, i) => (
              <li key={h.id}>
                <button
                  onClick={() => pick(h)}
                  onMouseEnter={() => setCursor(i)}
                  className={`w-full text-right px-4 py-2.5 flex items-center justify-between gap-3 ${
                    i === cursor ? "bg-sky-50" : "bg-white"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-[#0E2233] truncate">{h.name}</span>
                    <span className="block text-xs text-gray-500 tabular-nums">
                      {h.phone ?? "—"}{h.source ? ` · ${h.source}` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {STATUS_LABELS[h.status as LeadStatusValue] ?? h.status}
                  </span>
                </button>
              </li>
            ))}
            {!loading && hits.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-gray-400">
                לא נמצא מועמד/ת במערכת — כנראה פנייה חדשה
              </li>
            )}
          </ul>
        )}

        <div className="px-4 py-2 bg-gray-50 text-[11px] text-gray-400 flex justify-between">
          <span>↑↓ לבחירה · Enter לפתיחה · Esc לסגירה</span>
          <span>נפתח בחלון צף — לא יוצאים מהמסך הנוכחי</span>
        </div>
      </div>
    </div>
  );
}
