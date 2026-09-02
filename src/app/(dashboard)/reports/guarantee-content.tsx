"use client";

// לשונית "אחריות" — כל ההשמות בתקופת אחריות, ממוינות לפי דחיפות.

import Link from "next/link";
import type { GuaranteeRow } from "@/lib/postPlacement";

function badge(left: number): { label: string; cls: string } {
  if (left < 0) return { label: "מובטחת ✓", cls: "bg-green-100 text-green-800" };
  if (left <= 7) return { label: `${left} ימים לסיום`, cls: "bg-red-100 text-red-700" };
  if (left <= 14) return { label: `${left} ימים`, cls: "bg-amber-100 text-amber-800" };
  return { label: `${left} ימים`, cls: "bg-gray-100 text-gray-600" };
}

export function GuaranteeContent({ rows }: { rows: GuaranteeRow[] }) {
  const active = rows.filter((r) => r.days_left >= 0);
  const atRisk = active.filter((r) => r.days_left <= 7).length;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-3">
        <div className="bg-white border rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">השמות בתקופת אחריות</p>
          <p className="text-xl font-bold tabular-nums">{active.length}</p>
        </div>
        <div className="bg-white border rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">מסתיימות תוך שבוע</p>
          <p className="text-xl font-bold tabular-nums text-red-600">{atRisk}</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              <th className="text-right px-4 py-2">עובד/ת</th>
              <th className="text-right px-4 py-2">מעסיק</th>
              <th className="text-right px-4 py-2">תפקיד</th>
              <th className="text-right px-4 py-2">התחלה</th>
              <th className="text-right px-4 py-2">אחריות</th>
              <th className="text-right px-4 py-2">בדיקה אחרונה</th>
              <th className="text-right px-4 py-2">מצב</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = badge(r.days_left);
              return (
                <tr key={r.lead_id} className="border-t">
                  <td className="px-4 py-2">
                    <Link href={`/leads/${r.lead_id}`} className="text-cyan-700 hover:underline font-medium">
                      {r.name ?? "—"}
                    </Link>
                    {r.flagged && <span className="mr-2 text-red-500" title="דורש טיפול">⚑</span>}
                  </td>
                  <td className="px-4 py-2">{r.client ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{r.position ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{r.start_date}</td>
                  <td className="px-4 py-2 tabular-nums">{r.guarantee_days} ימים</td>
                  <td className="px-4 py-2 text-gray-500">{r.last_checkin ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${b.cls}`}>
                      {b.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  אין השמות פעילות עם תאריך התחלה
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        ימי האחריות: ברירת המחדל מוגדרת בלשונית הכספים; חריגים פר-מלון — דרך סער.
        בדיקות השלומות נשלחות אוטומטית מהמשתמש של מלי בימים 3, 14 ו-30 להעסקה.
      </p>
    </div>
  );
}
