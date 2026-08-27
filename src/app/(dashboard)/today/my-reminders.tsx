"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Reminder {
  id: string;
  lead_id: string;
  title: string;
  due_date: string;
  priority: "high" | "normal";
  leads: { name: string | null; phone: string | null; status: string } | null;
}

function whenLabel(iso: string, now: number): { text: string; overdue: boolean } {
  const d = new Date(iso);
  const overdue = d.getTime() <= now;
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return { text: `היום ${time}`, overdue };
  return {
    text: d.toLocaleDateString("he-IL", { day: "numeric", month: "short" }) + ` ${time}`,
    overdue,
  };
}

function waHref(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.startsWith("0") ? "972" + d.slice(1) : d}`;
}

// התזכורות העצמיות של המגייסת — מי שסומן "לא זמין במיידי" ונקבע לו מועד
// לחזור אליו. מוצג רק מה שכבר הגיע זמנו או מגיע בקרוב, כדי שזה יישאר
// רשימת עבודה ולא ארכיון.
export function MyReminders() {
  const [rows, setRows] = useState<Reminder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders");
      if (!res.ok) return;
      const data = (await res.json()) as { reminders: Reminder[] };
      setRows(data.reminders ?? []);
    } finally {
      setLoaded(true);
      setNow(Date.now());
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function complete(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    const res = await fetch("/api/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      toast.error("לא ניתן לסמן כבוצע");
      void load();
    }
  }

  if (!loaded || rows.length === 0) return null;

  // רק מה שרלוונטי היום: הגיע זמנו, או תוך 24 שעות
  const horizon = now + 24 * 60 * 60 * 1000;
  const due = rows.filter((r) => new Date(r.due_date).getTime() <= horizon);
  if (due.length === 0) return null;

  const laterCount = rows.length - due.length;

  return (
    <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-200">
        <h2 className="font-semibold text-amber-900 text-sm">
          🔔 להתקשר שוב ({due.length})
        </h2>
        {laterCount > 0 && (
          <span className="text-xs text-amber-700/70">ועוד {laterCount} בהמשך</span>
        )}
      </div>
      <ul className="divide-y divide-amber-200/60">
        {due.map((r) => {
          const when = whenLabel(r.due_date, now);
          const phone = r.leads?.phone ?? null;
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-100/40">
              <button
                type="button"
                onClick={() => complete(r.id)}
                title="סמן כבוצע"
                className="w-5 h-5 shrink-0 rounded border-2 border-amber-400 hover:bg-amber-400 hover:text-white text-transparent text-xs leading-none transition-colors"
              >
                ✓
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Link
                    href={`/leads/${r.lead_id}`}
                    className="font-semibold text-slate-900 hover:text-amber-800 hover:underline"
                  >
                    {r.leads?.name ?? "מועמד"}
                  </Link>
                  {r.priority === "high" && (
                    <span className="text-[10px] font-bold bg-red-600 text-white rounded-full px-1.5 py-0.5">דחוף</span>
                  )}
                  <span
                    className={`text-xs font-medium ${when.overdue ? "text-red-700" : "text-amber-800"}`}
                  >
                    {when.overdue ? "עבר — " : ""}{when.text}
                  </span>
                </div>
                <div className="text-xs text-slate-600 truncate">{r.title}</div>
              </div>
              {phone && (
                <div className="shrink-0 flex items-center gap-2 tabular-nums" dir="ltr">
                  <a href={`tel:${phone}`} className="text-sm font-medium text-slate-700 hover:text-amber-800">
                    {phone}
                  </a>
                  <a
                    href={waHref(phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold"
                  >
                    WA
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
