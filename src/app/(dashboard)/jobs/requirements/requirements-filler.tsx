"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Row {
  id: string;
  title: string;
  location: string;
  pay_rate: string;
  needed: number | null;
  client: string;
  requirements: string;
  notes: string;
  missing: boolean;
}

// דוגמאות שנלקחו מהערות אמיתיות שכבר קיימות במשרות — לחיצה מוסיפה לשדה,
// כדי שמילוי 35 משרות יהיה הקלדה קצרה ולא חיבור מחדש בכל פעם.
const CHIPS = [
  "שירות צבאי מלא חובה",
  "ניסיון קודם בתפקיד",
  "ללא ניסיון — הכשרה במקום",
  "אנגלית ברמה גבוהה",
  "אנגלית בסיסית",
  "זמינות למשמרות ערב",
  "זמינות למשמרות שבת",
  "משרה מפוצלת",
  "מגורים: יש",
  "תעודה מקצועית חובה",
];

export function RequirementsFiller() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/missing-requirements");
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: Row[] };
      setRows(data.jobs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(id: string) {
    const text = (drafts[id] ?? "").trim();
    if (!text || saving) return;
    setSaving(id);
    try {
      const res = await fetch("/api/jobs/missing-requirements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, requirements: text }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(d.error ?? "השמירה נכשלה");
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, requirements: text, missing: false } : r)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.success("נשמר — גובגט יידע להגיד את זה");
    } finally {
      setSaving(null);
    }
  }

  function addChip(id: string, chip: string) {
    setDrafts((prev) => {
      const cur = (prev[id] ?? "").trim();
      if (cur.includes(chip)) return prev;
      return { ...prev, [id]: cur ? `${cur} · ${chip}` : chip };
    });
  }

  const missing = rows.filter((r) => r.missing);
  const shown = showAll ? rows : missing;

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">טוען...</p>;

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-3">
        <div>
          <span className="text-sm font-semibold text-gray-900">
            {missing.length === 0 ? "כל המשרות מתוארות 🎉" : `${missing.length} משרות שגובגט לא יודע לתאר`}
          </span>
          <p className="text-xs text-gray-500 mt-0.5">
            משרה בלי דרישות מקבלת &quot;הדרישות ייסקרו איתך בראיון&quot; — נכון, אבל חלש מול מועמד ששואל.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs font-semibold text-cyan-700 hover:underline shrink-0"
        >
          {showAll ? "רק החסרות" : `הצג את כל ${rows.length}`}
        </button>
      </div>

      {shown.map((r) => (
        <section
          key={r.id}
          className={`rounded-xl border bg-white p-4 ${r.missing ? "border-amber-300" : "border-gray-200"}`}
        >
          <div className="flex items-baseline gap-2 flex-wrap mb-2">
            <h3 className="font-bold text-gray-900">{r.title}</h3>
            <span className="text-sm text-gray-500">{r.client}</span>
            {r.location && <span className="text-xs text-gray-400">· {r.location}</span>}
            {r.pay_rate && <span className="text-xs text-gray-400">· {r.pay_rate} ₪ לשעה</span>}
            {r.needed ? <span className="text-xs text-gray-400">· דרושים {r.needed}</span> : null}
          </div>

          {!r.missing && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5 mb-2">
              קיים: {r.requirements || r.notes}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 mb-2">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => addChip(r.id, c)}
                className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700 hover:bg-cyan-100 hover:text-cyan-800 transition-colors"
              >
                + {c}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={drafts[r.id] ?? ""}
              onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && save(r.id)}
              placeholder="מה צריך בשביל התפקיד הזה? אפשר להפריד ב-·"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              type="button"
              onClick={() => save(r.id)}
              disabled={!((drafts[r.id] ?? "").trim()) || saving === r.id}
              className="px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-40"
            >
              {saving === r.id ? "שומר..." : "שמור"}
            </button>
          </div>
        </section>
      ))}

      {shown.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">אין משרות חסרות — הכל מתואר.</p>
      )}
    </div>
  );
}
