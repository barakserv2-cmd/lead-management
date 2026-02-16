"use client";

import { useState, useRef, useEffect } from "react";
import { updateLeadStatus } from "./actions";

// DB enum values verified against live Supabase database
const QUICK_STATUSES = [
  { value: "חדש", label: "חדש", color: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  { value: "מעורב", label: "נוצר קשר", color: "bg-cyan-100 text-cyan-800", dot: "bg-cyan-500" },
  { value: "בסינון", label: "בסינון", color: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-500" },
  { value: "מתאים", label: "מתאים", color: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  { value: "נדחה", label: "נדחה", color: "bg-red-100 text-red-800", dot: "bg-red-500" },
];

function getStatusStyle(status: string) {
  return QUICK_STATUSES.find((s) => s.value === status) ?? {
    value: status,
    label: status,
    color: "bg-gray-100 text-gray-800",
    dot: "bg-gray-500",
  };
}

export function StatusSelect({ leadId, currentStatus }: { leadId: string; currentStatus: string }) {
  const [status, setStatus] = useState(currentStatus);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const current = getStatusStyle(status);

  async function handleSelect(newStatus: string) {
    if (newStatus === status) {
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(false);

    const result = await updateLeadStatus(leadId, newStatus);

    setLoading(false);

    if (result.error) {
      setToast(`שגיאה: ${result.error}`);
    } else {
      setStatus(newStatus);
      setToast("הסטטוס עודכן");
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 ${current.color} ${loading ? "opacity-50" : ""}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
        {current.label}
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 right-0 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in">
          {QUICK_STATUSES.map((s) => {
            const isActive = s.value === status;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => handleSelect(s.value)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-right hover:bg-gray-50 transition-colors ${isActive ? "bg-gray-50 font-semibold" : ""}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                {s.label}
                {isActive && (
                  <svg className="w-3 h-3 mr-auto text-blue-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}
    </div>
  );
}
