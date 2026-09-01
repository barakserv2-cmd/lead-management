"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { validateInterviewLocal } from "@/lib/interviewTime";

type InterviewType = "phone" | "in_person" | "video";

// interview_date נשמר כשעון קיר ישראלי עם תווית UTC, ולכן קוראים וכותבים
// את שדות ה-UTC כמו שהם — בדיוק כמו שהלוח מציג אותם.
const pad2 = (n: number) => String(n).padStart(2, "0");
function toWallInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
function wallLabel(iso: string): string {
  const d = new Date(iso);
  const day = new Date(`${toWallInput(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("he-IL", {
    weekday: "long", day: "numeric", month: "long",
  });
  return `${day} · ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

// שינוי מועד ראיון ישירות מהלוח. עד עכשיו זה חייב יציאה לכרטיס המועמד.
export function RescheduleDialog({
  leadId,
  leadName,
  currentDate,
  currentType,
  onClose,
}: {
  leadId: string;
  leadName: string;
  currentDate: string;
  currentType: InterviewType | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [when, setWhen] = useState(() => toWallInput(currentDate));
  const [type, setType] = useState<InterviewType>(currentType ?? "in_person");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const timeError = validateInterviewLocal(when);
  const unchanged = when === toWallInput(currentDate) && type === (currentType ?? "in_person");
  const canSave = !!when && !timeError && !unchanged && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interview_date: when, interview_type: type }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "עדכון מועד הראיון נכשל");
        return;
      }

      // נרשם ביומן כדי שיהיה גלוי לרכזות למה ומתי הראיון הוזז — ה-audit log
      // מתעד את השינוי אבל אינו מוצג במסך.
      await fetch(`/api/leads/${leadId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "תיאום",
          event_text:
            `מועד הראיון שונה: ${wallLabel(currentDate)} ← ${wallLabel(`${when}:00Z`)}` +
            (reason.trim() ? ` · ${reason.trim()}` : ""),
        }),
      }).catch(() => undefined);

      toast.success("מועד הראיון עודכן");
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => !saving && onClose()} />

      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-purple-600">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 truncate">שינוי מועד ראיון — {leadName}</h3>
            <p className="text-sm text-gray-500">כרגע: {wallLabel(currentDate)}</p>
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          מועד חדש <span className="text-red-500">*</span>
        </label>
        <input
          type="datetime-local"
          step={300}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
            timeError ? "border-red-400" : "border-gray-300"
          }`}
          dir="ltr"
        />
        <p className={`mt-1 text-xs ${timeError ? "text-red-600" : "text-gray-500"}`}>
          {timeError ?? "השעה שבה המועמד אמור להגיע"}
        </p>

        <div className="grid grid-cols-2 gap-2 mt-4">
          {([["phone", "📞 טלפוני"], ["in_person", "🏢 פרונטלי"], ["video", "🎥 וידאו"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setType(v)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                type === v
                  ? "bg-purple-50 border-purple-400 text-purple-900 ring-2 ring-purple-200"
                  : "bg-white border-gray-200 text-gray-700 hover:border-purple-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1 mt-4">סיבה (לא חובה)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="למשל: המועמד ביקש לדחות"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <p className="text-xs text-gray-400 mt-1">השינוי נרשם ביומן המועמד</p>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="flex-1 px-4 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "שומר..." : unchanged ? "לא בוצע שינוי" : "עדכן מועד"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
