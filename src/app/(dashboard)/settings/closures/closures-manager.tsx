"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { closuresBetween } from "@/lib/israelHolidays";

interface Closure {
  id: string;
  closure_date: string;
  name: string;
  half_day: boolean;
  created_by: string | null;
}

const DOW = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `יום ${DOW[d.getUTCDay()]}`;
}

function prettyDate(dateStr: string): string {
  return `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}/${dateStr.slice(0, 4)}`;
}

function todayIL(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

export function ClosuresManager() {
  const [rows, setRows] = useState<Closure[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [today] = useState(() => todayIL());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/closures");
      if (!res.ok) return;
      const data = (await res.json()) as { closures: Closure[]; isAdmin: boolean };
      setRows(data.closures ?? []);
      setIsAdmin(!!data.isAdmin);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!date || !name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/closures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, name: name.trim(), halfDay }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "לא ניתן להוסיף");
        return;
      }
      setDate("");
      setName("");
      setHalfDay(false);
      toast.success("נוסף — לא ייקבעו ראיונות ביום הזה");
      void load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Closure) {
    if (!confirm(`להסיר את "${c.name}" מ-${prettyDate(c.closure_date)}?\n\nמהרגע הזה יהיה אפשר לקבוע ראיונות ביום הזה.`)) return;
    const res = await fetch("/api/closures", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(d.error ?? "המחיקה נכשלה");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== c.id));
    toast.success("הוסר");
  }

  // החגים מחושבים בקוד ולא נשמרים בטבלה — מוצגים כאן כדי שיהיה ברור שהם
  // כבר מכוסים, ושלא ינסו להוסיף אותם ידנית.
  const computed = closuresBetween(today, 400);
  const upcoming = rows.filter((r) => r.closure_date >= today);
  const past = rows.filter((r) => r.closure_date < today);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* ── הוספה ── */}
      {isAdmin ? (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold text-gray-900 mb-1">הוספת יום סגירה</h2>
          <p className="text-xs text-gray-500 mb-3">
            ליום שהמשרד סגור בו ואינו חג — יום העצמאות, יום הזיכרון, יום גישור,
            או סגירה של החברה. חגי ישראל כבר חסומים אוטומטית.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">תאריך</label>
              <input
                type="date"
                value={date}
                min={today}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                dir="ltr"
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-gray-500 mb-1">מה זה</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="לדוגמה: יום העצמאות"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={halfDay}
                onChange={(e) => setHalfDay(e.target.checked)}
                className="w-4 h-4 accent-cyan-600"
              />
              יום קצר (עד 13:00)
            </label>
            <button
              type="button"
              onClick={add}
              disabled={!date || !name.trim() || saving}
              className="px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-50"
            >
              {saving ? "מוסיף..." : "הוסף"}
            </button>
          </div>
        </section>
      ) : (
        <p className="text-sm text-gray-500 bg-gray-50 border rounded-lg px-4 py-3">
          רק אדמין יכול להוסיף או להסיר ימי סגירה. הרשימה למטה לצפייה.
        </p>
      )}

      {/* ── ימי סגירה ידניים ── */}
      <section className="rounded-xl border bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-gray-50">
          <h2 className="font-semibold text-sm text-gray-800">
            ימי סגירה שהוספתם ({upcoming.length})
          </h2>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">טוען...</p>
        ) : upcoming.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">
            עוד לא הוספתם ימי סגירה. החגים חסומים ממילא.
          </p>
        ) : (
          <ul className="divide-y">
            {upcoming.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-gray-900">{c.name}</span>
                  {c.half_day && (
                    <span className="mr-2 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                      יום קצר
                    </span>
                  )}
                  <div className="text-xs text-gray-500">
                    {prettyDate(c.closure_date)} · {dayLabel(c.closure_date)}
                    {c.created_by ? ` · הוסיף/ה ${c.created_by}` : ""}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    className="text-xs text-red-600 hover:text-red-800 hover:underline shrink-0"
                  >
                    הסר
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <p className="px-4 py-2 text-xs text-gray-400 border-t bg-gray-50/60">
            ועוד {past.length} שכבר עברו
          </p>
        )}
      </section>

      {/* ── חגים מחושבים ── */}
      <section className="rounded-xl border bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-sm text-gray-800">חגי ישראל — חסומים אוטומטית</h2>
          <span className="text-xs text-gray-500">השנה הקרובה</span>
        </div>
        <ul className="divide-y">
          {computed.map((c) => (
            <li key={c.date} className="flex items-center gap-3 px-4 py-2">
              <div className="flex-1">
                <span className={c.info.closed ? "font-semibold text-gray-900" : "text-gray-700"}>
                  {c.info.name}
                </span>
                <span className="text-xs text-gray-500">
                  {" · "}
                  {prettyDate(c.date)} · {dayLabel(c.date)}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 ${
                  c.info.closed ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
                }`}
              >
                {c.info.closed ? "סגור" : "יום קצר"}
              </span>
            </li>
          ))}
        </ul>
        <p className="px-4 py-2.5 text-xs text-gray-500 border-t bg-gray-50/60">
          מחושבים מלוח השנה העברי — אין צורך לעדכן אותם כל שנה. שבתות חסומות ממילא
          דרך שעות הזמינות.
        </p>
      </section>
    </div>
  );
}
