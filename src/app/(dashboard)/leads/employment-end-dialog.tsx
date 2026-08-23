"use client";

import { useState } from "react";

interface EmploymentEndDialogProps {
  open: boolean;
  onConfirm: (data: { employmentEndDate: string }) => void;
  onCancel: () => void;
  loading?: boolean;
}

// דיאלוג סיום העסקה — נפתח כשבוחרים בסטטוס "סיום העסקה" (מדוח המועסקים
// או מכל בורר סטטוסים). שדה יחיד: תאריך הסיום, ברירת מחדל היום.
export function EmploymentEndDialog({
  open,
  onConfirm,
  onCancel,
  loading,
}: EmploymentEndDialogProps) {
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  if (!open) return null;

  const canSubmit = !!endDate && !loading;

  function reset() {
    setEndDate(new Date().toISOString().slice(0, 10));
  }

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm({ employmentEndDate: endDate });
    reset();
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />

      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6"
        dir="rtl"
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
            <h3 className="text-lg font-bold text-gray-900">סיום העסקה</h3>
            <p className="text-sm text-gray-500">מתי העובד סיים לעבוד?</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            תאריך סיום העסקה <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
            dir="ltr"
          />
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "שומר..." : "אישור סיום העסקה"}
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
