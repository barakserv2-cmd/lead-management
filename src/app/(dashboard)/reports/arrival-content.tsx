// לשונית "הגעה" — מי שנקבע לו ראיון פרונטלי באילת, כמה הגיעו ולמה לא.
// החישוב ב-src/lib/arrival.ts.

import type { ArrivalGroup, ArrivalReport } from "@/lib/arrival";

function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function dateLabel(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("he-IL", { timeZone: "UTC" });
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border rounded-xl px-4 py-3 min-w-[140px]">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function GroupTable({ title, keyLabel, groups }: { title: string; keyLabel: string; groups: ArrivalGroup[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px] tabular-nums">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              <th className="text-right px-4 py-2">{keyLabel}</th>
              <th className="text-right px-3 py-2">נקבע ראיון</th>
              <th className="text-right px-3 py-2">הגיעו</th>
              <th className="text-right px-3 py-2">לא הגיעו</th>
              <th className="text-right px-3 py-2">עוד לא עודכן</th>
              <th className="text-right px-3 py-2">אחוז הגעה</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const decided = g.arrived + g.notArrived;
              return (
                <tr key={g.key} className="border-t">
                  <td className="px-4 py-2 font-medium text-gray-800">{g.key}</td>
                  <td className="px-3 py-2">{g.booked}</td>
                  <td className="px-3 py-2 text-cyan-700">{g.arrived}</td>
                  <td className="px-3 py-2 text-gray-500">{g.notArrived}</td>
                  <td className="px-3 py-2 text-gray-400">{g.pending || "—"}</td>
                  <td className={`px-3 py-2 ${decided < 5 ? "text-gray-400" : "font-semibold text-gray-900"}`}>
                    {pct(g.rate)}
                  </td>
                </tr>
              );
            })}
            {groups.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  לא נקבעו ראיונות פרונטליים בתקופה
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ArrivalContent({ data }: { data: ArrivalReport }) {
  const t = data.totals;
  const missingReason = data.reasons.find((r) => r.code === null)?.count ?? 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-3">
        <Tile label="ראיונות פרונטליים שנקבעו" value={String(t.booked)} />
        <Tile label="הגיעו לאילת" value={String(t.arrived)} />
        <Tile label="לא הגיעו" value={String(t.notArrived)} />
        <Tile label="אחוז הגעה" value={pct(t.rate)} hint={t.pending ? `${t.pending} עוד לא עודכנו` : undefined} />
      </div>

      <GroupTable title="עם חבר או לבד" keyLabel="מגיע" groups={data.byFriend} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">למה לא מגיעים</h2>
        {missingReason > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 w-fit">
            ל-{missingReason} מתוך {t.notArrived} שלא הגיעו אין סיבה. מעכשיו הסיבה נשאלת בכל סימון &quot;לא הגיע&quot; או &quot;ביטל הגעה&quot;.
          </p>
        )}
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[420px] tabular-nums">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="text-right px-4 py-2">סיבה</th>
                <th className="text-right px-4 py-2">מועמדים</th>
                <th className="text-right px-4 py-2">מתוך מי שלא הגיע</th>
              </tr>
            </thead>
            <tbody>
              {data.reasons.map((r) => (
                <tr key={r.code ?? "none"} className="border-t">
                  <td className={`px-4 py-2 ${r.code === null ? "text-amber-700" : "text-gray-800"}`}>{r.label}</td>
                  <td className="px-4 py-2">{r.count}</td>
                  <td className="px-4 py-2 text-gray-500">{pct(t.notArrived ? r.count / t.notArrived : null)}</td>
                </tr>
              ))}
              {data.reasons.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-400">כל מי שנקבע לו ראיון הגיע</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <GroupTable title="לפי סוג מועמד" keyLabel="סוג מועמד" groups={data.bySegment} />

      <GroupTable title="לפי גורם גיוס" keyLabel="גורם גיוס" groups={data.bySource} />

      <div className="text-xs text-gray-400 space-y-1">
        <p>
          ראיונות פרונטליים שמועדם נפל בין {dateLabel(data.windowFrom)} ל-{dateLabel(data.windowTo)}.
          אחוז ההגעה מחושב רק על מי שכבר יש לו תוצאה. מועמד שנשאר ב&quot;ראיון נקבע&quot; או ב&quot;דחה הגעה&quot; נספר כ&quot;עוד לא עודכן&quot;.
        </p>
        <p>
          מועמד שנסגר אחרי הראיון בלי שסומן &quot;הגיע&quot; (למשל &quot;אבד קשר&quot;) נספר כמי שלא הגיע. אחוז של פחות מ-5 מועמדים מוצג באפור.
        </p>
      </div>
    </div>
  );
}
