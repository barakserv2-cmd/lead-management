"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useTransition } from "react";

export function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQ);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The last query WE pushed — used to tell "URL changed because of us"
  // from "URL changed externally" (back button, clearing filters).
  const lastPushedRef = useRef(urlQ);

  // Sync from URL only when the change did not come from this input, and
  // never while the user is actively typing — otherwise a slow, older
  // navigation finishing late would overwrite the characters typed since.
  useEffect(() => {
    if (urlQ === lastPushedRef.current) return;
    if (document.activeElement === inputRef.current) return;
    lastPushedRef.current = urlQ;
    // external sync (back button / filter reset) — intentional
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(urlQ);
  }, [urlQ]);

  // "/" מכל מקום בעמוד קופץ לחיפוש — כמו ב-Gmail. לא כשמקלידים בשדה אחר.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function push(q: string) {
    const trimmed = q.trim();
    if (trimmed === lastPushedRef.current) return;
    lastPushedRef.current = trimmed;
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    params.delete("page"); // reset to page 1 on a new search
    // replace (not push) so every keystroke doesn't pile up in history;
    // transition keeps the input responsive while the server renders.
    startTransition(() => {
      router.replace(`/leads?${params.toString()}`);
    });
  }

  function handleChange(newValue: string) {
    setValue(newValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => push(newValue), 350);
  }

  return (
    <div className="relative w-full max-w-md">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (timerRef.current) clearTimeout(timerRef.current);
            push(value);
          } else if (e.key === "Escape" && value) {
            if (timerRef.current) clearTimeout(timerRef.current);
            setValue("");
            push("");
          }
        }}
        placeholder="חיפוש לפי שם, טלפון או תפקיד..."
        className="w-full h-9 pr-9 pl-16 border border-gray-300 rounded-md text-[13px] shadow-xs placeholder:text-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
      />
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {isPending ? (
          <span
            className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"
            aria-label="מחפש..."
          />
        ) : value ? (
          <button
            type="button"
            onClick={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
              setValue("");
              push("");
              inputRef.current?.focus();
            }}
            className="text-gray-400 hover:text-gray-700 text-xs px-1"
            aria-label="נקה חיפוש"
          >
            ✕
          </button>
        ) : (
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-[10px] text-gray-400 font-sans">
            /
          </kbd>
        )}
      </div>
    </div>
  );
}
