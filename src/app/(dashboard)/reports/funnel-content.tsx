"use client";

// לשונית "משפך" — המרות, מקורות ורכזות. גלוי לכל הרכזות (בלי כסף).

import { useRouter } from "next/navigation";
import type { AnalyticsResult } from "@/lib/analytics";

const STAGE_COLORS = [
  "bg-cyan-600",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-indigo-500",
  "bg-green-600",
];

export function FunnelContent({
  data,
  from,
  to,
}: {
  data: AnalyticsResult;
  from: string;
  to: string;
}) {
  const router = useRouter();

  function setRange(nf: string, nt: string) {
    router.push(`/reports?tab=funnel&from=${nf}&to=${nt}`);
  }

  const maxCount = Math.max(1, ...data.funnel.map((f) => f.count));

  return (
    <div className="space-y-8" dir="rtl">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">תקופה:</span>
        <input
          type="date"
          defaultValue={from}
          onChange={(e) => e.target.value && setRange(e.target.value, to)}
          className="border rounded-md px-2 py-1"
          dir="ltr"
        />
        <span className="text-gray-400">עד</span>
        <input
          type="date"
          defaultValue={to}
          onChange={(e) => e.target.value && setRange(from, e.target.value)}
          className="border rounded-md px-2 py-1"
          dir="ltr"
        />
        <span className="text-gray-400 mr-2">
          {data.totalLeads} לידים נכנסו בתקופה
          {data.medianFirstTouchHours != null &&
            ` · חציון זמן לטיפול ראשון: ${data.medianFirstTouchHours < 1 ? `${Math.round(data.medianFirstTouchHours * 60)} דק'` : `${data.medianFirstTouchHours.toFixed(1)} שע'`}`}
        </span>
      </div>

      <div>
        <h3 className="font-bold text-gray-900 mb-3">המשפך — לאן מגיעים הלידים של התקופה</h3>
        <div className="space-y-2 max-w-2xl">
          {data.funnel.map((stage, i) => {
            const prev = i > 0 ? data.funnel[i - 1] : null;
            const drop =
              prev && prev.count > 0
                ? Math.round(((prev.count - stage.count) / prev.count) * 100)
                : null;
            return (
              <div key={stage.key} className="flex items-center gap-3">
                <span className="w-28 text-sm text-gray-600 shrink-0">{stage.label}</span>
                <div className="flex-1 bg-gray-100 rounded-lg h-8 overflow-hidden">
                  <div
                    className={`${STAGE_COLORS[i] ?? "bg-gray-400"} h-full rounded-lg flex items-center justify-end px-2 min-w-[3.5rem]`}
                    style={{ width: `${Math.max(8, (stage.count / maxCount) * 100)}%` }}
                  >
                    <span className="text-white text-xs font-bold tabular-nums">
                      {stage.count} · {stage.pct}%
                    </span>
                  </div>
                </div>
                <span className="w-16 text-xs text-red-500 tabular-nums shrink-0">
                  {drop != null && drop > 0 ? `−${drop}%` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="font-bold text-gray-900 mb-3">לפי מקור גיוס</h3>
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="text-right px-4 py-2">מקור</th>
                <th className="text-right px-4 py-2">לידים</th>
                <th className="text-right px-4 py-2">טופלו</th>
                <th className="text-right px-4 py-2">ראיונות</th>
                <th className="text-right px-4 py-2">השמות</th>
                <th className="text-right px-4 py-2">ליד ← השמה</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.source} className="border-t tabular-nums">
                  <td className="px-4 py-2 font-medium">{s.source}</td>
                  <td className="px-4 py-2">{s.leads}</td>
                  <td className="px-4 py-2">{s.contacted}</td>
                  <td className="px-4 py-2">{s.interviews}</td>
                  <td className="px-4 py-2 font-bold text-green-700">{s.hires}</td>
                  <td className="px-4 py-2">
                    {s.leads > 0 ? `${((s.hires / s.leads) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="font-bold text-gray-900 mb-3">לפי רכזת (לפי מי שביצעה את המעברים)</h3>
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[460px]">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="text-right px-4 py-2">רכזת</th>
                <th className="text-right px-4 py-2">פעולות</th>
                <th className="text-right px-4 py-2">ראיונות שקבעה</th>
                <th className="text-right px-4 py-2">השמות</th>
              </tr>
            </thead>
            <tbody>
              {data.recruiters.map((r) => (
                <tr key={r.email} className="border-t tabular-nums">
                  <td className="px-4 py-2 font-medium">{r.email.split("@")[0]}</td>
                  <td className="px-4 py-2">{r.actions}</td>
                  <td className="px-4 py-2">{r.interviews}</td>
                  <td className="px-4 py-2 font-bold text-green-700">{r.hires}</td>
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
      </div>
    </div>
  );
}
