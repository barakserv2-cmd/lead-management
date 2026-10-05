"use client";

import { useState } from "react";
import { NEVER_STARTED_REASONS } from "@/lib/constants";

export interface NeverStartedData {
  /** code from NEVER_STARTED_REASONS */
  neverStartedReason: string;
  neverStartedNotes: string;
}

interface NeverStartedDialogProps {
  leadName?: string;
  onConfirm: (data: NeverStartedData) => void;
  onCancel: () => void;
  loading?: boolean;
}

// "לא התחיל לעבוד" — מי שהתקבל ולא הגיע ליום הראשון. עד 05.10 נסגרו כ"סיום
// העסקה" כאילו עבדו (מלי). הסיבה חובה, ו"אחר" מחייב פירוט — אחרת אין מעקב.
export function NeverStartedDialog({ leadName, onConfirm, onCancel, loading }: NeverStartedDialogProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const needsNotes = reason === "other";
  const canSubmit = !!reason && (!needsNotes || !!notes.trim()) && !loading;

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm({ neverStartedReason: reason, neverStartedNotes: notes.trim() });
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
            לא התחיל לעבוד
            {leadName ? ` — ${leadName}` : ""}
          </h3>
          <p className="text-sm text-gray-500">התקבל/ה לעבודה ולא התחיל/ה בפועל. למה?</p>
        </div>

        <p className="block text-sm font-medium text-gray-700 mb-1.5">
          סיבה <span className="text-red-500">*</span>
        </p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="סיבה">
          {NEVER_STARTED_REASONS.map((r) => (
            <button
              key={r.code}
              type="button"
              role="radio"
              aria-checked={reason === r.code}
              onClick={() => setReason(r.code)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                reason === r.code
                  ? "bg-orange-700 border-orange-700 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-500"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <label htmlFor="never-started-notes" className="block text-sm font-medium text-gray-700 mt-4 mb-1">
          פירוט {needsNotes ? <span className="text-red-500">*</span> : "(לא חובה)"}
        </label>
        <textarea
          id="never-started-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="למשל: אמר שמגיע ביום ראשון, לא הגיע ולא עונה מאז"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">הסיבה נשמרת על הליד ונכנסת לדוח המועסקים.</p>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-orange-700 text-white text-sm font-semibold rounded-lg hover:bg-orange-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
