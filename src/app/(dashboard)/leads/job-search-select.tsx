"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Building2 } from "lucide-react";

export interface JobSearchOption {
  id: string;
  title: string;
  clientName: string;
  payRate?: string | null;
  urgent?: boolean;
}

/**
 * Free-text job picker. Type any words — employer, role, pay — in any
 * order ("מלצר קיסר", "קבלה", "40+2"); every word must match somewhere.
 * Arrow keys + Enter to pick, Esc to close.
 */
export function JobSearchSelect({
  jobs,
  value,
  onChange,
  loading,
  autoFocus,
  placeholder = "הקלד תפקיד / מלון... למשל: מלצר קיסר",
}: {
  jobs: JobSearchOption[];
  value: string; // selected job id ("" = none)
  onChange: (id: string) => void;
  loading?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => jobs.find((j) => j.id === value) ?? null, [jobs, value]);

  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const scored = jobs
      .map((j) => {
        const hay = `${j.clientName} ${j.title} ${j.payRate ?? ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        // rank: title starts with a word > client starts with a word > anything
        let score = 0;
        for (const w of words) {
          if (j.title.toLowerCase().startsWith(w)) score += 3;
          else if (j.title.toLowerCase().includes(w)) score += 2;
          if (j.clientName.toLowerCase().startsWith(w)) score += 2;
        }
        if (j.urgent) score += 1;
        return { j, score };
      })
      .filter((x): x is { j: JobSearchOption; score: number } => x !== null)
      .sort((a, b) => b.score - a.score || a.j.clientName.localeCompare(b.j.clientName, "he"));
    return scored.slice(0, 40).map((x) => x.j);
  }, [jobs, query]);

  // keep the active row in view
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(j: JobSearchOption) {
    onChange(j.id);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 w-full rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm">
        <Building2 className="w-4 h-4 text-green-700 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900 truncate">{selected.title}</div>
          <div className="text-xs text-gray-600 truncate">
            {selected.clientName}
            {selected.payRate ? ` · ₪${selected.payRate}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={clear}
          className="text-gray-400 hover:text-red-600 shrink-0"
          title="בחר משרה אחרת"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
              setOpen(true);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[active]) pick(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={loading ? "טוען משרות..." : placeholder}
          disabled={loading}
          dir="rtl"
          className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50"
        />
      </div>

      {open && !loading && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm"
          onMouseDown={(e) => e.preventDefault() /* keep input focus */}
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-gray-400 text-center">
              {jobs.length === 0 ? "אין משרות פתוחות" : "לא נמצאה משרה מתאימה"}
            </li>
          ) : (
            results.map((j, i) => (
              <li
                key={j.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(j)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${
                  i === active ? "bg-green-50" : "hover:bg-gray-50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 truncate">
                    {j.title}
                    {j.urgent && (
                      <span className="ms-2 text-[10px] bg-amber-100 text-amber-800 rounded px-1">דחוף</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{j.clientName}</div>
                </div>
                {j.payRate && (
                  <span className="text-xs text-gray-500 font-mono shrink-0" dir="ltr">
                    {/^\d/.test(j.payRate) ? `₪${j.payRate}` : j.payRate}
                  </span>
                )}
              </li>
            ))
          )}
          {results.length === 40 && (
            <li className="px-3 py-1.5 text-[11px] text-gray-400 text-center border-t">
              מוצגות 40 הראשונות — הקלד עוד כדי לצמצם
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
