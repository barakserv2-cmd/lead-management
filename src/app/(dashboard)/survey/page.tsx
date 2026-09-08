"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const RATINGS: { key: "job_relevance" | "job_accuracy" | "conversation"; label: string }[] = [
  { key: "job_relevance", label: "עד כמה גובגט מציגה למועמדים את המשרות הנכונות?" },
  { key: "job_accuracy", label: "עד כמה פרטי המשרות מדויקים (שכר / מיקום / מעסיק)?" },
  { key: "conversation", label: "עד כמה השיחות של גובגט טבעיות ומקצועיות?" },
];
const MISSING = ["פרטי שכר", "שם המעסיק", "עוד משרות", "דרישות התפקיד", "מדיניות/תנאים", "מיקום מדויק", "אחר"];

type Item = { id: string; author: string; job_relevance: number | null; job_accuracy: number | null; conversation: number | null; missing: string[]; comment: string | null; created_at: string };
type Data = { items: Item[]; isAdmin: boolean; count: number; averages: Record<string, number | null>; missingCounts: Record<string, number> };

export default function SurveyPage() {
  const [data, setData] = useState<Data | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/survey", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    setSending(true);
    try {
      const res = await fetch("/api/survey", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ratings, missing, comment }),
      });
      if (res.ok) { setSent(true); setRatings({}); setMissing([]); setComment(""); setTimeout(() => setSent(false), 3000); load(); }
    } finally { setSending(false); }
  }

  const canSubmit = Object.keys(ratings).length > 0 || missing.length > 0 || comment.trim();

  return (
    <div dir="rtl" className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0E2233]">שאלון משוב — גובגט</h1>
        <p className="text-sm text-gray-500 mt-1">המשוב שלכן מכוון את גובגט לשפר את עצמה — במיוחד בהנגשת המשרות. דקה, פעם בשבוע.</p>
      </div>

      {/* Admin summary */}
      {data?.isAdmin && data.count > 0 && (
        <div className="bg-[#0E2233] text-white rounded-2xl p-5">
          <div className="text-sm text-white/70 mb-3">ממוצעים · {data.count} תשובות</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {RATINGS.map((r) => (
              <div key={r.key}>
                <div className="text-3xl font-black">{data.averages[r.key] ?? "—"}</div>
                <div className="text-[11px] text-white/60 mt-1">{r.label.split("?")[0].slice(0, 22)}…</div>
              </div>
            ))}
          </div>
          {Object.keys(data.missingCounts).length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/15">
              <div className="text-xs text-white/60 mb-2">מה הכי חסר לגובגט (לפי הרכזות):</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(data.missingCounts).sort((a, b) => b[1] - a[1]).map(([m, c]) => (
                  <span key={m} className="text-xs bg-white/15 rounded-full px-2.5 py-1">{m} · {c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Survey form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-5">
        {RATINGS.map((r) => (
          <div key={r.key}>
            <div className="text-sm font-medium text-[#0E2233] mb-2">{r.label}</div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRatings((s) => ({ ...s, [r.key]: n }))}
                  className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${ratings[r.key] === n ? "bg-[#0875E1] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                  {n}
                </button>
              ))}
              <span className="self-center text-xs text-gray-400 mr-1">1=גרוע · 5=מצוין</span>
            </div>
          </div>
        ))}

        <div>
          <div className="text-sm font-medium text-[#0E2233] mb-2">מה חסר לגובגט? (אפשר כמה)</div>
          <div className="flex flex-wrap gap-2">
            {MISSING.map((m) => (
              <button key={m} type="button"
                onClick={() => setMissing((s) => s.includes(m) ? s.filter((x) => x !== m) : [...s, m])}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${missing.includes(m) ? "bg-[#0875E1] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-[#0E2233] mb-2">מה הכי ישפר את גובגט? (או מקרה ספציפי)</div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} dir="rtl" rows={3}
            placeholder="לדוגמה: 'לא הציעה משרת ברמן למועמד שהתאים', או 'חסר שכר במשרות של פתאל'..." />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={sending || !canSubmit}>{sending ? "שולח..." : "שלח משוב"}</Button>
          {sent && <span className="text-sm text-green-600">✅ תודה! המשוב יעזור לשפר את גובגט.</span>}
        </div>
      </div>
    </div>
  );
}
