"use client";

import { useEffect, useState } from "react";

interface StartWorkDialogProps {
  leadId: string;
  leadName?: string;
  onConfirm: (data: { startDate: string }) => void;
  onCancel: () => void;
  loading?: boolean;
}

function todayIso(): string {
  // לוח ישראל — אחרת אחרי חצות UTC ברירת המחדל קופצת ליום הקודם
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

// דיאלוג "התחיל לעבוד" — נפתח בכל מעבר לסטטוס STARTED ומאפשר לתקן את
// תאריך תחילת העבודה שנקבע בעת הקבלה. נפתח עם התאריך הקיים של המועמד
// (נטען מהשרת) כדי שאישור מהיר לא ידרוס תאריך שכבר סוכם.
export function StartWorkDialog({
  leadId,
  leadName,
  onConfirm,
  onCancel,
  loading,
}: StartWorkDialogProps) {
  const [startDate, setStartDate] = useState("");
  const [fetching, setFetching] = useState(true);
  const [existing, setExisting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leads/${leadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const current = (d?.lead?.start_date as string | null) ?? null;
        setExisting(current);
        setStartDate(current ? current.slice(0, 10) : todayIso());
      })
      .catch(() => {
        if (!cancelled) setStartDate(todayIso());
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const canSubmit = !!startDate && !loading && !fetching;

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm({ startDate });
  }

  function handleCancel() {
    if (loading) return;
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />

      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-emerald-600"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              התחיל לעבוד{leadName ? ` — ${leadName}` : ""}
            </h3>
            <p className="text-sm text-gray-500">מתי הוא התחיל בפועל?</p>
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          תאריך תחילת עבודה <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={startDate}
          disabled={fetching}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-50"
          dir="ltr"
        />
        <p className="text-xs text-gray-400 mt-1">
          {fetching
            ? "טוען את התאריך הקיים…"
            : existing
              ? `התאריך שנקבע בקבלה: ${new Date(existing).toLocaleDateString("he-IL")}`
              : "לא נקבע תאריך בקבלה — ברירת המחדל היא היום"}
        </p>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "שומר..." : "אישור תחילת עבודה"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
