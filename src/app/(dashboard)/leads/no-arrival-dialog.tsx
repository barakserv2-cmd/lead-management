"use client";

import { useState } from "react";
import { NO_ARRIVAL_REASONS } from "@/lib/constants";

export interface NoArrivalData {
  /** code from NO_ARRIVAL_REASONS */
  noArrivalReason: string;
  noArrivalNotes: string;
}

interface NoArrivalDialogProps {
  /** "לא הגיע" או "ביטל הגעה" — הכותרת בלבד משתנה */
  title: string;
  leadName?: string;
  onConfirm: (data: NoArrivalData) => void;
  onCancel: () => void;
  loading?: boolean;
}

// דיאלוג "לא הגיע" / "ביטל הגעה". כשליש ממי שאמר "מגיע" לא מגיע לאילת;
// הסיבה נשמרת על הליד (no_arrival_reason) גם אחרי שהסטטוס מתקדם, כדי
// שדוח ההגעה יראה למה — ובמיוחד כמה נופלים כי החבר התחרט.
export function NoArrivalDialog({ title, leadName, onConfirm, onCancel, loading }: NoArrivalDialogProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const canSubmit = !!reason && !loading;

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm({ noArrivalReason: reason, noArrivalNotes: notes.trim() });
  }

  function handleCancel() {
    if (loading) return;
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />

      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5">
          <h3 className="text-lg font-bold text-gray-900">
            {title}
            {leadName ? ` — ${leadName}` : ""}
          </h3>
          <p className="text-sm text-gray-500">למה המועמד לא הגיע?</p>
        </div>

        <p className="block text-sm font-medium text-gray-700 mb-1.5">
          סיבה <span className="text-red-500">*</span>
        </p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="סיבה">
          {NO_ARRIVAL_REASONS.map((r) => (
            <button
              key={r.code}
              type="button"
              role="radio"
              aria-checked={reason === r.code}
              onClick={() => setReason(r.code)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                reason === r.code
                  ? "bg-gray-800 border-gray-800 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-500"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <label htmlFor="no-arrival-notes" className="block text-sm font-medium text-gray-700 mt-4 mb-1">
          פירוט (לא חובה)
        </label>
        <textarea
          id="no-arrival-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="למשל: החבר שלו נשאר בבאר שבע, אמר שאולי יבוא בחודש הבא"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">הסיבה נכנסת לדוח ההגעה.</p>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "שומר..." : "שמור"}
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
