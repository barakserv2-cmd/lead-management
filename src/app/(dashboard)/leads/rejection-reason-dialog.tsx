"use client";

import { useState } from "react";
import { INTERVIEW_REJECTION_REASONS } from "@/lib/constants";

interface RejectionReasonDialogProps {
  open: boolean;
  leadName?: string;
  onConfirm: (data: { rejectionReason: string }) => void;
  onCancel: () => void;
  loading?: boolean;
}

// מינימום תווים לתיעוד — מונע "לא" / "..." כתירוץ למילוי השדה.
const MIN_LEN = 4;

// הדיאלוג מורכב רק כשהוא פתוח (הצרכן מרנדר אותו מותנה), ולכן ה-state
// מתאפס מעצמו בכל פתיחה — וטקסט שכבר הוקלד לא נמחק אם השמירה נכשלה.
// דיאלוג "לא התקבל" — נפתח בכל מעבר לסטטוס NOT_ACCEPTED (לוח הראיונות,
// טבלת הלידים, כרטיס הליד). התיעוד הוא חובה: בלי סיבה כתובה אי אפשר
// לסגור את המועמד, כדי שתמיד יהיה ברור למה הוא נפסל.
export function RejectionReasonDialog({
  open,
  leadName,
  onConfirm,
  onCancel,
  loading,
}: RejectionReasonDialogProps) {
  const [quick, setQuick] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);

  if (!open) return null;

  const trimmed = text.trim();
  const tooShort = trimmed.length < MIN_LEN;
  const canSubmit = !tooShort && !loading;

  // הקטגוריה היא קיצור-דרך לסינון בדוחות, לא תחליף לתיעוד — הטקסט
  // החופשי נשאר חובה גם אחרי שבוחרים אותה. קליק שני מבטל את הבחירה.
  function pickQuick(reason: string) {
    setQuick((prev) => (prev === reason ? null : reason));
  }

  function handleConfirm() {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    const reason = quick && quick !== "אחר" ? `${quick} — ${trimmed}` : trimmed;
    onConfirm({ rejectionReason: reason });
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
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-gray-600"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              לא התקבל{leadName ? ` — ${leadName}` : ""}
            </h3>
            <p className="text-sm text-gray-500">חובה לתעד למה המועמד לא התקבל</p>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-1.5">קטגוריה (לא חובה)</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {INTERVIEW_REJECTION_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => pickQuick(r)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                quick === r
                  ? "bg-gray-800 border-gray-800 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-500"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          פירוט <span className="text-red-500">*</span>
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setTouched(true)}
          rows={4}
          autoFocus
          placeholder="למשל: הגיע לראיון אצל ישרוטל, אין ניסיון קודם במטבח והמעסיק חיפש מנוסה"
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${
            touched && tooShort
              ? "border-red-400 focus:ring-red-400"
              : "border-gray-300 focus:ring-gray-500"
          }`}
        />
        {touched && tooShort ? (
          <p className="text-xs text-red-600 mt-1">חובה לכתוב סיבה (לפחות {MIN_LEN} תווים)</p>
        ) : (
          <p className="text-xs text-gray-400 mt-1">
            הסיבה נשמרת בכרטיס המועמד וביומן האירועים, ומופיעה בדוחות.
          </p>
        )}

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "שומר..." : "שמור — לא התקבל"}
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
