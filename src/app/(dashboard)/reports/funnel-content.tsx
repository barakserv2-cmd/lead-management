"use client";

// לשונית "משפך" — לאן מגיעים הלידים שנכנסו בתקופה, איפה הם נתקעים ונושרים,
// וכמה זמן זה לוקח. גלוי לכל הרכזות (בלי כסף).
//
// המשפך הוא קוהורטה: הלידים שנכנסו בתקופה, וכל שלב שאליו הגיעו אי-פעם (גם
// אחרי סוף התקופה). המספרים מצטברים — ליד שקפץ שלב נספר גם בשלבים שדילג.

import { useRouter } from "next/navigation";
import { STATUS_LABELS, type LeadStatusValue } from "@/lib/stateMachine";
import type { AnalyticsResult } from "@/lib/analytics";

function ilToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}
function shift(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function presets(): { label: string; from: string; to: string }[] {
  const t = ilToday();
  const [y, m] = t.split("-").map(Number);
  const mm = (n: number) => String(n).padStart(2, "0");
  const last = (yy: number, mo: number) => new Date(Date.UTC(yy, mo, 0)).getUTCDate();
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return [
    { label: "7 ימים", from: shift(t, -6), to: t },
    { label: "30 ימים", from: shift(t, -29), to: t },
    { label: "90 ימים", from: shift(t, -89), to: t },
    { label: "חודש נוכחי", from: `${y}-${mm(m)}-01`, to: `${y}-${mm(m)}-${mm(last(y, m))}` },
    { label: "חודש קודם", from: `${py}-${mm(pm)}-01`, to: `${py}-${mm(pm)}-${mm(last(py, pm))}` },
  ];
}

function fmtDate(s: string): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    new Date(`${s}T12:00:00Z`)
  );
}

function fmtHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} דק׳`;
  if (h < 48) return `${h.toFixed(1)} שע׳`;
  return `${(h / 24).toFixed(1)} ימים`;
}
function fmtDays(d: number | null): string {
  if (d == null) return "—";
  if (d < 1) return `${Math.round(d * 24)} שע׳`;
  return `${d.toFixed(1)} ימים`;
}

const rate = (part: number, total: number) => (total > 0 ? (part / total) * 100 : null);
const fmtPct = (p: number | null, digits = 0) => (p == null ? "—" : `${p.toFixed(digits)}%`);

/** שינוי מול התקופה הקודמת. `lowerIsBetter` לזמנים. מוצג תמיד עם חץ וטקסט, לא רק צבע. */
function Delta({
  now,
  before,
  unit,
  lowerIsBetter = false,
  digits = 0,
}: {
  now: number | null;
  before: number | null;
  unit: "pct" | "pts" | "num";
  lowerIsBetter?: boolean;
  digits?: number;
}) {
  if (now == null || before == null) return <span className="text-[11px] text-gray-400">אין נתון להשוואה</span>;
  const diff = now - before;
  if (Math.abs(diff) < (unit === "num" ? 0.5 : 0.05)) return <span className="text-[11px] text-gray-500">ללא שינוי</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  const arrow = diff > 0 ? "▲" : "▼";
  const text =
    unit === "pts"
      ? `${Math.abs(diff).toFixed(1)} נק׳`
      : unit === "pct"
        ? `${before !== 0 ? Math.abs((diff / before) * 100).toFixed(0) : "∞"}%`
        : Math.abs(diff).toFixed(digits);
  return (
    <span className={`text-[11px] font-medium ${good ? "text-emerald-700" : "text-red-700"}`}>
      {arrow} {text}
    </span>
  );
}

function Tile({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">{value}</span>
        {sub && <span className="text-xs text-gray-500 tabular-nums">{sub}</span>}
      </div>
      <div className="mt-1">{delta}</div>
    </div>
  );
}

export function FunnelContent({
  data,
  prev,
  from,
  to,
  prevFrom,
  prevTo,
  recruiterNames = {},
}: {
  data: AnalyticsResult;
  prev: AnalyticsResult;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  recruiterNames?: Record<string, string>;
}) {
  const router = useRouter();
  function setRange(nf: string, nt: string) {
    router.push(`/reports?tab=funnel&from=${nf}&to=${nt}`);
  }

  const stage = (r: AnalyticsResult, key: string) => r.funnel.find((s) => s.key === key)?.count ?? 0;
  const total = data.totalLeads;
  const interviewRate = rate(stage(data, "interview"), total);
  const hireRate = rate(stage(data, "hired"), total);
  const prevInterviewRate = rate(stage(prev, "interview"), prev.totalLeads);
  const prevHireRate = rate(stage(prev, "hired"), prev.totalLeads);

  // צוואר הבקבוק: המעבר עם שיעור ההמרה הנמוך ביותר (מתוך מעברים עם בסיס של 5+ לידים)
  const steps = data.funnel.slice(1);
  let bottleneck: string | null = null;
  let worst = Infinity;
  steps.forEach((s, i) => {
    const base = data.funnel[i].count;
    if (s.stepPct != null && base >= 5 && s.stepPct < worst) {
      worst = s.stepPct;
      bottleneck = s.key;
    }
  });

  const exitsTotal = data.exits.reduce((n, e) => n + e.count, 0);
  const maxExit = Math.max(1, ...data.exits.map((e) => e.count));
  const openTotal = data.open.reduce((n, o) => n + o.count, 0);
  const activePreset = presets().find((p) => p.from === from && p.to === to)?.label;

  return (
    <div className="space-y-6" dir="rtl">
      {/* ── תקופה ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap items-center rounded-md border border-gray-200 bg-gray-100 p-0.5">
          {presets().map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setRange(p.from, p.to)}
              aria-pressed={activePreset === p.label}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activePreset === p.label ? "bg-white text-cyan-700 shadow-xs" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-gray-300 bg-white text-xs shadow-xs">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setRange(e.target.value, to)}
            className="bg-transparent outline-none"
            aria-label="מתאריך"
            dir="ltr"
          />
          <span className="text-gray-400">–</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => e.target.value && setRange(from, e.target.value)}
            className="bg-transparent outline-none"
            aria-label="עד תאריך"
            dir="ltr"
          />
        </div>
        <span className="text-xs text-gray-500">
          בהשוואה לתקופה הקודמת: <bdi>{fmtDate(prevFrom)}</bdi> עד <bdi>{fmtDate(prevTo)}</bdi>
        </span>
      </div>

      {data.truncated && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-[13px] text-amber-900">
          התקופה גדולה מדי לחישוב מלא — המספרים חלקיים. בחרו טווח קצר יותר.
        </div>
      )}

      {/* ── מספרי מפתח ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile
          label="לידים שנכנסו"
          value={total.toLocaleString("he-IL")}
          delta={<Delta now={total} before={prev.totalLeads} unit="pct" />}
        />
        <Tile
          label="הגיעו לראיון"
          value={fmtPct(interviewRate)}
          sub={`${stage(data, "interview")} לידים`}
          delta={<Delta now={interviewRate} before={prevInterviewRate} unit="pts" />}
        />
        <Tile
          label="התקבלו"
          value={fmtPct(hireRate, 1)}
          sub={`${stage(data, "hired")} לידים`}
          delta={<Delta now={hireRate} before={prevHireRate} unit="pts" />}
        />
        <Tile
          label="זמן עד טיפול ראשון"
          value={fmtHours(data.medianFirstTouchHours)}
          sub="חציון"
          delta={<Delta now={data.medianFirstTouchHours} before={prev.medianFirstTouchHours} unit="pct" lowerIsBetter />}
        />
        <Tile
          label="ימים עד ראיון"
          value={fmtDays(data.medianDaysToInterview)}
          sub="חציון"
          delta={<Delta now={data.medianDaysToInterview} before={prev.medianDaysToInterview} unit="pct" lowerIsBetter />}
        />
        <Tile
          label="ימים עד קבלה"
          value={fmtDays(data.medianDaysToHire)}
          sub="חציון"
          delta={<Delta now={data.medianDaysToHire} before={prev.medianDaysToHire} unit="pct" lowerIsBetter />}
        />
      </div>

      {/* ── המשפך ───────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h3 className="text-sm font-semibold text-gray-900">המשפך — לאן הגיעו הלידים של התקופה</h3>
          <span className="text-xs text-gray-500">כל שלב כולל את מי שהגיע אליו או רחוק ממנו</span>
        </div>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">לא נכנסו לידים בתקופה הזו</p>
        ) : (
          <ol className="space-y-1.5">
            {data.funnel.map((s, i) => {
              const isBottleneck = s.key === bottleneck;
              const prevStage = prev.funnel.find((p) => p.key === s.key);
              return (
                <li key={s.key} className="grid grid-cols-[6.5rem_1fr_auto] sm:grid-cols-[8rem_1fr_9.5rem] items-center gap-3">
                  <span className="text-[13px] text-gray-700">{s.label}</span>
                  <div
                    className="relative h-8 rounded-md bg-gray-100"
                    title={`${s.label}: ${s.count.toLocaleString("he-IL")} לידים (${s.pct}% מהנכנסים)${
                      prevStage ? ` · בתקופה הקודמת ${prevStage.pct}%` : ""
                    }`}
                  >
                    <div
                      className={`absolute inset-y-0 right-0 rounded-md ${i === 0 ? "bg-cyan-600" : "bg-cyan-500"}`}
                      style={{ width: `${Math.max(s.count > 0 ? 1.5 : 0, s.pct)}%` }}
                    />
                    <span className="absolute inset-y-0 right-2 flex items-center text-xs font-semibold tabular-nums text-gray-900 mix-blend-normal">
                      <span className="whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5">
                        {s.count.toLocaleString("he-IL")} · {s.pct}%
                      </span>
                    </span>
                  </div>
                  <span className="text-xs tabular-nums text-gray-500 text-left sm:text-right">
                    {s.stepPct == null ? (
                      ""
                    ) : (
                      <>
                        <span className={isBottleneck ? "font-semibold text-red-700" : ""}>
                          {s.stepPct}% עברו
                        </span>
                        {isBottleneck && (
                          <span className="mr-1.5 inline-block rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                            צוואר בקבוק
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* ── נשירה ומה עוד פתוח ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-900">איפה נושרים</h3>
            <span className="text-xs text-gray-500 tabular-nums">
              {exitsTotal.toLocaleString("he-IL")} נסגרו · {fmtPct(rate(exitsTotal, total))}
            </span>
          </div>
          {data.exits.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">אין לידים שנסגרו בתקופה</p>
          ) : (
            <ul className="space-y-2">
              {data.exits.map((e) => (
                <li key={e.status} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-[13px]">
                  <span className="text-gray-700">{STATUS_LABELS[e.status as LeadStatusValue] ?? e.status}</span>
                  <div className="h-2 rounded-full bg-gray-100" title={`${e.count} לידים, מהם ${e.afterInterview} אחרי ראיון`}>
                    <div className="h-full rounded-full bg-gray-400" style={{ width: `${(e.count / maxExit) * 100}%` }} />
                  </div>
                  <span className="tabular-nums text-gray-900 font-medium">
                    {e.count}
                    {e.afterInterview > 0 && (
                      <span className="mr-1 text-[11px] font-normal text-gray-500">({e.afterInterview} אחרי ראיון)</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-900">עדיין פתוחים</h3>
            <span className="text-xs text-gray-500 tabular-nums">
              {openTotal.toLocaleString("he-IL")} לידים · {fmtPct(rate(openTotal, total))}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {data.open.map((o) => (
              <div key={o.key} className="rounded-lg bg-gray-50 p-3">
                <div className="text-[11px] text-gray-500">{o.label}</div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">{o.count}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            לידים מהתקופה שעוד לא הגיעו לתוצאה — המשפך שלהם עדיין יכול להשתנות.
          </p>
        </section>
      </div>

      {/* ── לפי מקור ────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">לפי מקור גיוס</h3>
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-[13px] min-w-[620px]">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="text-right font-medium px-4 py-2">מקור</th>
                <th className="text-right font-medium px-4 py-2">לידים</th>
                <th className="text-right font-medium px-4 py-2">טופלו</th>
                <th className="text-right font-medium px-4 py-2">ראיונות</th>
                <th className="text-right font-medium px-4 py-2">ליד ← ראיון</th>
                <th className="text-right font-medium px-4 py-2">השמות</th>
                <th className="text-right font-medium px-4 py-2">ליד ← השמה</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.source} className="border-t border-gray-100 tabular-nums">
                  <td className="px-4 py-2 font-medium text-gray-900">{s.source}</td>
                  <td className="px-4 py-2">{s.leads}</td>
                  <td className="px-4 py-2">{s.contacted}</td>
                  <td className="px-4 py-2">{s.interviews}</td>
                  <td className="px-4 py-2 text-gray-600">{fmtPct(rate(s.interviews, s.leads))}</td>
                  <td className="px-4 py-2 font-semibold text-emerald-700">{s.hires}</td>
                  <td className="px-4 py-2 text-gray-600">{fmtPct(rate(s.hires, s.leads), 1)}</td>
                </tr>
              ))}
              {data.sources.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-center text-gray-400">
                    אין לידים בתקופה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── לפי רכזת ────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">
          לפי רכזת <span className="font-normal text-gray-500">· מי ביצעה את המעברים על לידי התקופה</span>
        </h3>
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-[13px] min-w-[460px]">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="text-right font-medium px-4 py-2">רכזת</th>
                <th className="text-right font-medium px-4 py-2">פעולות</th>
                <th className="text-right font-medium px-4 py-2">ראיונות שקבעה</th>
                <th className="text-right font-medium px-4 py-2">השמות</th>
              </tr>
            </thead>
            <tbody>
              {data.recruiters.map((r) => (
                <tr key={r.email} className="border-t border-gray-100 tabular-nums">
                  <td className="px-4 py-2 font-medium text-gray-900" title={r.email}>
                    {recruiterNames[r.email.toLowerCase()] ?? r.email.split("@")[0]}
                  </td>
                  <td className="px-4 py-2">{r.actions}</td>
                  <td className="px-4 py-2">{r.interviews}</td>
                  <td className="px-4 py-2 font-semibold text-emerald-700">{r.hires}</td>
                </tr>
              ))}
              {data.recruiters.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-5 text-center text-gray-400">
                    אין פעולות רכזות בתקופה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
