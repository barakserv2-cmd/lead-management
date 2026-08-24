"use client";

import { useRouter } from "next/navigation";

// בורר היום ללוח הלידים: היום / אתמול / כל תאריך. שומר על סינון הרכזת
// שכבר פעיל, ומשמיט את date כשחוזרים להיום כדי שה-URL יישאר נקי.
export function DayNav({
  selected,
  todayKey,
  yesterdayKey,
  recruiter,
}: {
  selected: string;
  todayKey: string;
  yesterdayKey: string;
  recruiter: string | null;
}) {
  const router = useRouter();

  function go(date: string) {
    const params = new URLSearchParams();
    if (recruiter) params.set("recruiter", recruiter);
    if (date !== todayKey) params.set("date", date);
    const qs = params.toString();
    router.push(qs ? `/today?${qs}` : "/today");
  }

  function shift(days: number) {
    const d = new Date(`${selected}T12:00:00`);
    d.setDate(d.getDate() + days);
    go(d.toISOString().slice(0, 10));
  }

  return (
    <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden">
      {([
        ["היום", todayKey],
        ["אתמול", yesterdayKey],
      ] as const).map(([label, key]) => (
        <button
          key={label}
          type="button"
          onClick={() => go(key)}
          className={`text-sm px-3 py-2 border-l border-slate-200 transition-colors ${
            selected === key ? "bg-cyan-600 text-white font-semibold" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => shift(-1)}
        className="text-sm px-2.5 py-2 text-slate-600 hover:bg-slate-50"
        title="יום אחורה"
        aria-label="יום אחורה"
      >
        ▸
      </button>
      <input
        type="date"
        value={selected}
        max={todayKey}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="text-sm px-2 py-1.5 bg-white text-slate-700 outline-none"
        aria-label="תאריך הלוח"
      />
      <button
        type="button"
        onClick={() => shift(1)}
        disabled={selected >= todayKey}
        className="text-sm px-2.5 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        title="יום קדימה"
        aria-label="יום קדימה"
      >
        ◂
      </button>
    </div>
  );
}
