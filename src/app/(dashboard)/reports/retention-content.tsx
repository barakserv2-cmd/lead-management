// לשונית "שימור" — כמה זמן עובדים נשארים, לפי ערוץ ולפי מעסיק, ולמה עוזבים.
// החישוב ב-src/lib/retention.ts.

import Link from "next/link";
import { CHECK_REASON_LABELS, type CheckItem } from "@/lib/employmentCheck";
import {
  SURVIVAL_DAYS,
  type RetentionGroup,
  type RetentionReport,
  type SurvivalCell,
} from "@/lib/retention";

const MONTH_NAMES = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}`;
}

function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/** אחוז + כמה עובדים נבדקו; מדגם קטן מ-5 מוצג באפור כדי שלא יטעה. */
function SurvivalValue({ cell }: { cell: SurvivalCell }) {
  if (cell.rate === null) return <span className="text-gray-300">—</span>;
  const small = cell.eligible < 5;
  return (
    <span className={small ? "text-gray-400" : "text-gray-900 font-medium"} title={`${cell.survived} מתוך ${cell.eligible}`}>
      {pct(cell.rate)}
      <span className="text-[11px] text-gray-400 font-normal"> ({cell.eligible})</span>
    </span>
  );
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

function GroupTable({ title, keyLabel, groups }: { title: string; keyLabel: string; groups: RetentionGroup[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px] tabular-nums">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              <th className="text-right px-4 py-2">{keyLabel}</th>
              <th className="text-right px-3 py-2">התחילו</th>
              <th className="text-right px-3 py-2">פעילים</th>
              <th className="text-right px-3 py-2">עזבו</th>
              {SURVIVAL_DAYS.map((d) => (
                <th key={d} className="text-right px-3 py-2">נשארו {d} יום</th>
              ))}
              <th className="text-right px-3 py-2">חציון ימים (עזבו)</th>
              <th className="text-right px-3 py-2">חודשי עבודה</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="border-t">
                <td className="px-4 py-2 font-medium text-gray-800">{g.key}</td>
                <td className="px-3 py-2">{g.started}</td>
                <td className="px-3 py-2 text-cyan-700">{g.active}</td>
                <td className="px-3 py-2 text-gray-500">{g.left}</td>
                {SURVIVAL_DAYS.map((d) => (
                  <td key={d} className="px-3 py-2">
                    <SurvivalValue cell={g.survival[d]} />
                  </td>
                ))}
                <td className="px-3 py-2 text-gray-600">{g.medianDaysLeft ?? "—"}</td>
                <td className="px-3 py-2 font-medium">{g.workerMonths}</td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={5 + SURVIVAL_DAYS.length + 2} className="px-4 py-6 text-center text-gray-400">
                  אין עובדים שהתחילו לעבוד בשנה האחרונה
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmploymentCheck({ items }: { items: CheckItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-800">לבדוק: עדיין עובדים? ({items.length})</h2>
      <p className="text-xs text-gray-500">
        עובדים שמסומנים פעילים אבל יש סימן שאולי לא הגיעו או כבר עזבו. מי שעובד — לסמן &quot;התחיל לעבוד&quot;;
        מי שעזב — &quot;סיום העסקה&quot; עם סיבה. בלי זה הדוח למטה מציג תמונה אופטימית מדי.
      </p>
      <div className="bg-white border border-amber-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead>
            <tr className="bg-amber-50 text-xs text-amber-900">
              <th className="text-right px-4 py-2">עובד/ת</th>
              <th className="text-right px-3 py-2">מעסיק</th>
              <th className="text-right px-3 py-2">התחיל</th>
              <th className="text-right px-3 py-2">למה לבדוק</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="px-4 py-2">
                  <Link href={`/leads/${i.id}`} className="text-cyan-700 hover:underline font-medium">
                    {i.name ?? "—"}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-600">{i.hired_client ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums text-gray-600">לפני {i.daysSinceStart} ימים</td>
                <td className="px-3 py-2 text-amber-800">{i.reasons.map((r) => CHECK_REASON_LABELS[r]).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RetentionContent({ data, check = [] }: { data: RetentionReport; check?: CheckItem[] }) {
  const t = data.totals;
  const totalExits = data.reasons.reduce((s, r) => s + r.count, 0);
  const missingReason = data.reasons.find((r) => r.code === null)?.count ?? 0;

  return (
    <div className="space-y-6" dir="rtl">
      <EmploymentCheck items={check} />

      <div className="flex flex-wrap gap-3">
        <Tile label="עובדים פעילים כעת" value={String(data.activeNow)} hint={data.upcoming ? `ועוד ${data.upcoming} שעוד לא התחילו` : undefined} />
        <Tile label="התחילו לעבוד בשנה האחרונה" value={String(t.started)} />
        <Tile label="נשארו 30 יום" value={pct(t.survival[30].rate)} hint={`מתוך ${t.survival[30].eligible}`} />
        <Tile label="נשארו 90 יום" value={pct(t.survival[90].rate)} hint={`מתוך ${t.survival[90].eligible}`} />
        <Tile label="חציון ימים בקרב מי שעזב" value={t.medianDaysLeft === null ? "—" : String(t.medianDaysLeft)} />
        <Tile label="חודשי עבודה שנצברו" value={String(t.workerMonths)} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">תנועה חודשית</h2>
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[420px] tabular-nums">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="text-right px-4 py-2">חודש</th>
                <th className="text-right px-4 py-2">התחילו</th>
                <th className="text-right px-4 py-2">עזבו</th>
                <th className="text-right px-4 py-2">שינוי נטו</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => {
                const net = m.started - m.left;
                return (
                  <tr key={m.month} className="border-t">
                    <td className="px-4 py-2">{monthLabel(m.month)}</td>
                    <td className="px-4 py-2">{m.started}</td>
                    <td className="px-4 py-2">{m.left}</td>
                    <td className={`px-4 py-2 font-semibold ${net > 0 ? "text-green-700" : net < 0 ? "text-red-600" : "text-gray-500"}`} dir="ltr">
                      {net > 0 ? `+${net}` : net}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <GroupTable title="לפי גורם גיוס" keyLabel="גורם גיוס" groups={data.bySource} />

      <GroupTable title="לפי סוג מועמד" keyLabel="סוג מועמד" groups={data.bySegment} />

      <GroupTable title="עם חבר או לבד" keyLabel="הגיע לאילת" groups={data.byFriend} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">למה עוזבים</h2>
        {missingReason > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 w-fit">
            ל-{missingReason} מתוך {totalExits} העזיבות אין סיבה. אפשר להשלים אותה בדוח המועסקים: לוחצים על הסטטוס &quot;סיום העסקה&quot;.
          </p>
        )}
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[420px] tabular-nums">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="text-right px-4 py-2">סיבה</th>
                <th className="text-right px-4 py-2">עזיבות</th>
                <th className="text-right px-4 py-2">מתוך כל העזיבות</th>
              </tr>
            </thead>
            <tbody>
              {data.reasons.map((r) => (
                <tr key={r.code ?? "none"} className="border-t">
                  <td className={`px-4 py-2 ${r.code === null ? "text-amber-700" : "text-gray-800"}`}>
                    {r.label}
                    {r.planned && (
                      <span className="mr-2 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-[11px] font-semibold">סיום טבעי</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{r.count}</td>
                  <td className="px-4 py-2 text-gray-500">{pct(totalExits ? r.count / totalExits : null)}</td>
                </tr>
              ))}
              {data.reasons.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-400">אין עזיבות בשנה האחרונה</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <GroupTable title="לפי מעסיק" keyLabel="מעסיק" groups={data.byClient} />

      <div className="text-xs text-gray-400 space-y-1">
        <p>
          הדוח כולל עובדים שהתחילו לעבוד מ-{new Date(`${data.cohortFrom}T00:00:00Z`).toLocaleDateString("he-IL", { timeZone: "UTC" })}.
          &quot;נשארו N יום&quot; נבדק רק לעובדים שהתחילו לפני N ימים לפחות. המספר בסוגריים הוא כמה עובדים נבדקו, ומדגם של פחות מ-5 מוצג באפור.
        </p>
        <p>
          מעבר בין מעסיקים נספר כהמשך העסקה. חודשי עבודה הם סכום ימי העבודה של כל העובדים, מחולק ל-30.4.
          {data.neverStarted > 0 && ` ${data.neverStarted} עובדים שסומנו "לא התחיל לעבוד בפועל" לא נכללים בחישוב.`}
          {data.undated > 0 && ` ${data.undated} עובדים בלי תאריך התחלה או סיום לא נכללים בחישוב.`}
        </p>
      </div>
    </div>
  );
}
