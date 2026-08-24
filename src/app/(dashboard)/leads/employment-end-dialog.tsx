"use client";

import { useEffect, useState } from "react";

interface EmploymentEndDialogProps {
  leadId: string;
  leadName?: string;
  /** true when the lead is already in "סיום העסקה" and only the date is being fixed. */
  editOnly?: boolean;
  onConfirm: (data: { employmentEndDate: string }) => void;
  onCancel: () => void;
  loading?: boolean;
}

function todayIso(): string {
  // לוח ישראל — אחרת אחרי חצות UTC ברירת המחדל קופצת ליום הקודם
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

// דיאלוג סיום העסקה — נפתח כשבוחרים בסטטוס "סיום העסקה" מכל בורר סטטוסים,
// וגם כשלוחצים על הסטטוס הקיים כדי לתקן את התאריך בדיעבד. נפתח על התאריך
// שכבר רשום למועמד כדי שאישור מהיר לא ידרוס תאריך שכבר נקבע.
export function EmploymentEndDialog({
  leadId,
  leadName,
  editOnly,
  onConfirm,
  onCancel,
  loading,
}: EmploymentEndDialogProps) {
  const [endDate, setEndDate] = useState("");
  const [fetching, setFetching] = useState(true);
  const [existing, setExisting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leads/${leadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const current = (d?.lead?.employment_end_date as string | null) ?? null;
        setExisting(current);
        setEndDate(current ? current.slice(0, 10) : todayIso());
      })
      .catch(() => {
        if (!cancelled) setEndDate(todayIso());
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const canSubmit = !!endDate && !loading && !fetching;

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm({ employmentEndDate: endDate });
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
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-slate-600"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="17" x2="22" y1="8" y2="13" />
              <line x1="22" x2="17" y1="8" y2="13" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {editOnly ? "עריכת תאריך סיום העסקה" : "סיום העסקה"}
              {leadName ? ` — ${leadName}` : ""}
            </h3>
            <p className="text-sm text-gray-500">מתי העובד סיים לעבוד?</p>
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          תאריך סיום העסקה <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={endDate}
          disabled={fetching}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent disabled:bg-gray-50"
          dir="ltr"
        />
        <p className="text-xs text-gray-400 mt-1">
          {fetching
            ? "טוען את התאריך הקיים…"
            : existing
              ? `התאריך הרשום כרגע: ${new Date(existing).toLocaleDateString("he-IL")}`
              : "לא נרשם תאריך — ברירת המחדל היא היום"}
        </p>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "שומר..." : editOnly ? "שמור תאריך" : "אישור סיום העסקה"}
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
