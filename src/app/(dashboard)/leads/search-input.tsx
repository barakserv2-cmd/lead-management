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
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (timerRef.current) clearTimeout(timerRef.current);
            push(value);
          }
        }}
        placeholder="חיפוש לפי שם, טלפון או תפקיד..."
        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
      />
      {isPending && (
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"
          aria-label="מחפש..."
        />
      )}
    </div>
  );
}
