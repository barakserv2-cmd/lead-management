"use client";

import { useState } from "react";

interface CallbackReminderDialogProps {
  leadName?: string;
  reason: string;
  onConfirm: (data: { dueAt: string; title: string; priority: "high" | "normal" }) => void;
  onSkip: () => void;
  loading?: boolean;
}

// ברירת מחדל 10:00 — שעה שבה מתחילים להתקשר, לא השעה שבה סימנו את הסטטוס.
const CALL_HOUR = 10;

function atCallHour(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(CALL_HOUR, 0, 0, 0);
  return d;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PRESETS: { label: string; days: number }[] = [
  { label: "מחר", days: 1 },
  { label: "בעוד 3 ימים", days: 3 },
  { label: "בעוד שבוע", days: 7 },
  { label: "בעוד שבועיים", days: 14 },
  { label: "בעוד חודש", days: 30 },
];

// נפתח מיד אחרי שסימנו "לא זמין במיידי" — המועמד רלוונטי, רק לא עכשיו,
// אז הוא לא אמור ליפול בין הכיסאות. התזכורת היא של המגייסת לעצמה.
export function CallbackReminderDialog({
  leadName,
  reason,
  onConfirm,
  onSkip,
  loading,
}: CallbackReminderDialogProps) {
  const [when, setWhen] = useState(() => toLocalInput(atCallHour(7)));
  const [picked, setPicked] = useState<number | null>(7);
  const [urgent, setUrgent] = useState(false);
  // "עכשיו" נלכד פעם אחת בפתיחה — קריאה ל-Date.now() בכל רינדור אינה טהורה
  const [openedAt] = useState(() => Date.now());

  function pick(days: number) {
    setPicked(days);
    setWhen(toLocalInput(atCallHour(days)));
  }

  const dueDate = new Date(when);
  const valid = !Number.isNaN(dueDate.getTime()) && dueDate.getTime() > openedAt;

  function handleConfirm() {
    if (!valid || loading) return;
    onConfirm({
      dueAt: dueDate.toISOString(),
      title: `להתקשר שוב${leadName ? ` ל${leadName}` : ""} — ${reason}`,
      priority: urgent ? "high" : "normal",
    });
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => !loading && onSkip()} />

      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-amber-600">
              <path d="M10.268 21a2 2 0 0 0 3.464 0" />
              <path d="M22 8c0-2.3-.8-4.3-2-6" />
              <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
              <path d="M4 2C2.8 3.7 2 5.7 2 8" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">מתי להתקשר שוב?</h3>
            <p className="text-sm text-gray-500">
              {leadName ? `${leadName} — ` : ""}תזכורת אישית שלך, לא נשלחת למועמד
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => pick(p.days)}
              className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                picked === p.days
                  ? "bg-amber-500 border-amber-500 text-white font-semibold"
                  : "bg-white border-gray-300 text-gray-600 hover:border-amber-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">מועד מדויק</label>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => { setWhen(e.target.value); setPicked(null); }}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent ${
            valid ? "border-gray-300" : "border-red-400"
          }`}
          dir="ltr"
        />
        {!valid && <p className="text-xs text-red-600 mt-1">צריך מועד עתידי</p>}

        <label className="flex items-center gap-2 mt-3 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="w-4 h-4 accent-amber-500" />
          לסמן כדחוף
        </label>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!valid || loading}
            className="flex-1 px-4 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "שומר..." : "קבע תזכורת"}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={loading}
            className="px-4 py-2.5 text-gray-500 text-sm hover:text-gray-800 transition-colors"
          >
            בלי תזכורת
          </button>
        </div>
      </div>
    </div>
  );
}
