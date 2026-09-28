"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  LeadStatus,
  STATUS_LABELS,
  STATUS_COLORS,
  PRE_INTERVIEW_STATUSES,
  INTERVIEW_STATUSES,
  POST_HIRE_STATUSES,
  CLOSED_STATUSES,
  type LeadStatusValue,
} from "@/lib/stateMachine";

// תמונת מצב של המשפך תחת הסינון הנוכחי (מקור/חיפוש/רכזת/תאריכים) — בלי
// סינון הסטטוס, כדי שתמיד רואים את כל התמונה ולא רק את מה שנבחר.
// המספרים הם לפי הסטטוס *הנוכחי* של כל ליד, לא היסטוריה — ולכן "שיעור
// גיוס" כאן = כמה מהלידים בתקופה נמצאים היום בשלב גיוס.
const STAGES: { key: string; label: string; hint: string; statuses: readonly LeadStatusValue[] }[] = [
  { key: "waiting", label: "ממתינים לנציג", hint: "עוד לא טופלו", statuses: [LeadStatus.NEW_LEAD] },
  {
    key: "working",
    label: "בטיפול",
    hint: "נוצר קשר / סינון",
    statuses: PRE_INTERVIEW_STATUSES.filter((s) => s !== LeadStatus.NEW_LEAD),
  },
  { key: "interview", label: "בראיון", hint: "נקבע / הגיע / נדחה", statuses: INTERVIEW_STATUSES },
  { key: "hired", label: "גויסו", hint: "התקבל / התחיל", statuses: POST_HIRE_STATUSES },
  { key: "closed", label: "נסגרו", hint: "נדחה / לא הגיע / אבד קשר", statuses: CLOSED_STATUSES },
];

// המספרים עצמם בשחור — צבע רק למה שדורש תשומת לב (ממתינים) ולתוצאה (גויסו)
const STAGE_ACCENT: Record<string, string> = {
  waiting: "text-gray-900",
  working: "text-gray-900",
  interview: "text-gray-900",
  hired: "text-emerald-700",
  closed: "text-gray-400",
};

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  const p = (part / total) * 100;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
}

export function PipelineStrip({ statusCounts }: { statusCounts: Record<string, number> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = new Set(searchParams.get("statuses")?.split(",").filter(Boolean) ?? []);

  const count = (s: string) => statusCounts[s] ?? 0;
  const sum = (list: readonly string[]) => list.reduce((n, s) => n + count(s), 0);
  const total = Object.values(statusCounts).reduce((n, c) => n + c, 0);

  if (total === 0) return null;

  // קליק = להציג רק את זה. קליק על מה שכבר מוצג לבד = לבטל.
  // Ctrl/⌘ + קליק = להוסיף/להוריד מהבחירה הקיימת.
  function pick(statuses: readonly string[], additive: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    let next: Set<string>;
    if (additive) {
      next = new Set(selected);
      const allIn = statuses.every((s) => next.has(s));
      statuses.forEach((s) => (allIn ? next.delete(s) : next.add(s)));
    } else {
      const same = selected.size === statuses.length && statuses.every((s) => selected.has(s));
      next = same ? new Set() : new Set(statuses);
    }
    if (next.size > 0) params.set("statuses", [...next].join(","));
    else params.delete("statuses");
    params.delete("page");
    router.push(`/leads?${params.toString()}`);
  }

  const isActive = (statuses: readonly string[]) =>
    selected.size > 0 && statuses.every((s) => selected.has(s));

  const hired = sum(POST_HIRE_STATUSES);
  const inPlay = sum(PRE_INTERVIEW_STATUSES) + sum(INTERVIEW_STATUSES);

  return (
    <section className="mb-5" aria-label="תמונת מצב לפי שלב">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-sm font-semibold text-gray-800">
          תמונת מצב <span className="text-gray-400 font-normal">· {total.toLocaleString("he-IL")} לידים בטווח</span>
        </h2>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>
            עדיין בתהליך: <b className="text-gray-800 tabular-nums">{pct(inPlay, total)}</b>
          </span>
          <span>
            שיעור גיוס: <b className="text-emerald-700 tabular-nums">{pct(hired, total)}</b>
          </span>
        </div>
      </div>

      {/* פס יחסי — כל סטטוס בצבע שלו, לחיץ */}
      <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-gray-100 mb-3" role="img" aria-label="התפלגות סטטוסים">
        {STAGES.flatMap((st) => st.statuses).map((s) => {
          const c = count(s);
          if (c === 0) return null;
          const dim = selected.size > 0 && !selected.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={(e) => pick([s], e.ctrlKey || e.metaKey)}
              title={`${STATUS_LABELS[s]} · ${c.toLocaleString("he-IL")} (${pct(c, total)})`}
              className={`${STATUS_COLORS[s].dot} h-full transition-opacity hover:opacity-80 ${dim ? "opacity-25" : ""}`}
              style={{ width: `${(c / total) * 100}%` }}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {STAGES.map((st) => {
          const n = sum(st.statuses);
          const active = isActive(st.statuses);
          const nonEmpty = st.statuses.filter((s) => count(s) > 0);
          return (
            <div
              key={st.key}
              className={`rounded-lg border p-3 transition-colors ${
                active ? "border-cyan-300 bg-cyan-50/40 ring-1 ring-cyan-300" : "border-gray-200 hover:border-gray-300 hover:shadow-xs"
              } ${n === 0 ? "opacity-60" : ""}`}
            >
              <button
                type="button"
                disabled={n === 0}
                onClick={(e) => pick(st.statuses, e.ctrlKey || e.metaKey)}
                className="w-full text-right disabled:cursor-default"
                title={`הצג רק: ${st.label}`}
              >
                <div className="text-xs font-medium text-gray-500">{st.label}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl font-semibold tracking-tight tabular-nums ${STAGE_ACCENT[st.key]}`}>
                    {n.toLocaleString("he-IL")}
                  </span>
                  <span className="text-[11px] text-gray-400 tabular-nums">{pct(n, total)}</span>
                </div>
              </button>
              {st.statuses.length > 1 && nonEmpty.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {nonEmpty.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={(e) => pick([s], e.ctrlKey || e.metaKey)}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                        selected.has(s) ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[s].dot}`} />
                      {STATUS_LABELS[s]}
                      <span className="tabular-nums font-semibold">{count(s)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-1.5 text-[10px] text-gray-400">{st.hint}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
