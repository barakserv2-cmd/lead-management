"use client";

// לשונית "כספים" — ROI אמיתי פר ערוץ. נטענת רק למשתמש המורשה
// (isFinanceUser בצד השרת); הרכיב הזה לא מגיע לדפדפן של אף אחד אחר.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { FinanceResult } from "@/lib/analytics";

const nis = (n: number | null | undefined) =>
  n == null ? "—" : `₪${Math.round(n).toLocaleString("he-IL")}`;

export function FinanceContent({
  data,
  from,
  to,
}: {
  data: FinanceResult;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [fee, setFee] = useState(String(data.fee || ""));
  const [busy, setBusy] = useState(false);
  const [costMonth, setCostMonth] = useState(data.months[data.months.length - 1] ?? "");
  const [edits, setEdits] = useState<Record<string, string>>({});

  function setRange(nf: string, nt: string) {
    router.push(`/reports?tab=finance&from=${nf}&to=${nt}`);
  }

  async function post(payload: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(d.error ?? "השמירה נכשלה");
      return false;
    }
    return true;
  }

  async function saveFee() {
    if (busy) return;
    setBusy(true);
    try {
      if (await post({ action: "set_fee", fee: Number(fee) })) {
        toast.success("דמי ההשמה נשמרו");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveCosts() {
    if (busy) return;
    setBusy(true);
    try {
      let saved = 0;
      for (const [source, val] of Object.entries(edits)) {
        if (val === "") continue;
        if (await post({ action: "set_cost", source, month: costMonth, amount: Number(val) })) {
          saved++;
        }
      }
      if (saved > 0) {
        toast.success(`נשמרו ${saved} הוצאות לחודש`);
        setEdits({});
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const costFor = (source: string, month: string): number | null => {
    const row = data.costs.find((c) => c.source === source && c.month === month);
    return row ? row.amount : null;
  };

  const profit = data.totals.revenue - data.totals.spend;

  return (
    <div className="space-y-8" dir="rtl">
      <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 w-fit">
        🔒 הלשונית הזו גלויה רק לך. רכזות ואדמיניות אחרות לא רואות אותה — האכיפה בצד השרת.
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">תקופה:</span>
        <input type="date" defaultValue={from} onChange={(e) => e.target.value && setRange(e.target.value, to)} className="border rounded-md px-2 py-1" dir="ltr" />
        <span className="text-gray-400">עד</span>
        <input type="date" defaultValue={to} onChange={(e) => e.target.value && setRange(from, e.target.value)} className="border rounded-md px-2 py-1" dir="ltr" />
        <span className="text-gray-400 mr-4">דמי השמה ממוצעים:</span>
        <input
          type="number"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          className="border rounded-md px-2 py-1 w-24 tabular-nums"
          dir="ltr"
          placeholder="₪"
        />
        <button
          type="button"
          onClick={saveFee}
          disabled={busy}
          className="px-3 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-700 disabled:opacity-50"
        >
          שמירה
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">הוצאה בתקופה</p>
          <p className="text-xl font-bold tabular-nums">{nis(data.totals.spend)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">השמות</p>
          <p className="text-xl font-bold tabular-nums">{data.totals.hires}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">הכנסה משוערת</p>
          <p className="text-xl font-bold tabular-nums">{nis(data.totals.revenue)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">רווח משוער</p>
          <p className={`text-xl font-bold tabular-nums ${profit >= 0 ? "text-green-700" : "text-red-600"}`}>
            {nis(profit)}
          </p>
        </div>
      </div>

      <div>
        <h3 className="font-bold text-gray-900 mb-1">ROI פר ערוץ גיוס</h3>
        <p className="text-xs text-gray-500 mb-3">
          הכנסה = השמות × דמי השמה. ערוץ בלי הוצאה מוזנת מציג "—" בעמודות העלות.
        </p>
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="text-right px-4 py-2">ערוץ</th>
                <th className="text-right px-4 py-2">הוצאה</th>
                <th className="text-right px-4 py-2">לידים</th>
                <th className="text-right px-4 py-2">עלות לליד</th>
                <th className="text-right px-4 py-2">השמות</th>
                <th className="text-right px-4 py-2">עלות להשמה</th>
                <th className="text-right px-4 py-2">הכנסה</th>
                <th className="text-right px-4 py-2">ROI</th>
              </tr>
            </thead>
            <tbody>
              {data.bySource.map((s) => (
                <tr key={s.source} className="border-t tabular-nums">
                  <td className="px-4 py-2 font-medium">{s.source}</td>
                  <td className="px-4 py-2">{s.spend > 0 ? nis(s.spend) : "—"}</td>
                  <td className="px-4 py-2">{s.leads}</td>
                  <td className="px-4 py-2">{nis(s.costPerLead)}</td>
                  <td className="px-4 py-2 font-bold">{s.hires}</td>
                  <td className="px-4 py-2">{nis(s.costPerHire)}</td>
                  <td className="px-4 py-2">{s.hires > 0 ? nis(s.revenue) : "—"}</td>
                  <td className="px-4 py-2">
                    {s.roi == null ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <span className={`font-bold ${s.roi >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {s.roi >= 0 ? "+" : ""}
                        {Math.round(s.roi * 100)}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="font-bold text-gray-900 mb-1">הזנת הוצאות חודשיות</h3>
        <p className="text-xs text-gray-500 mb-3">
          כמה שילמת בחודש הזה על כל ערוץ (קמפיינים, מנוי AllJobs וכו'). שדה ריק = בלי שינוי.
        </p>
        <div className="flex items-center gap-2 mb-3 text-sm">
          <span className="text-gray-500">חודש:</span>
          <select
            value={costMonth}
            onChange={(e) => setCostMonth(e.target.value)}
            className="border rounded-md px-2 py-1.5"
          >
            {data.months.map((m) => (
              <option key={m} value={m}>
                {m.slice(0, 7)}
              </option>
            ))}
          </select>
        </div>
        <div className="bg-white border rounded-xl p-4 space-y-2 max-w-md">
          {data.bySource.map((s) => (
            <div key={s.source} className="flex items-center gap-3">
              <span className="flex-1 text-sm">{s.source}</span>
              <span className="text-xs text-gray-400 tabular-nums w-20">
                {costFor(s.source, costMonth) != null ? nis(costFor(s.source, costMonth)) : ""}
              </span>
              <input
                type="number"
                value={edits[s.source] ?? ""}
                onChange={(e) => setEdits((x) => ({ ...x, [s.source]: e.target.value }))}
                placeholder="₪ לחודש"
                className="border rounded-md px-2 py-1 w-28 text-sm tabular-nums"
                dir="ltr"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={saveCosts}
            disabled={busy || Object.values(edits).every((v) => v === "")}
            className="mt-2 px-4 py-2 rounded-md bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 disabled:opacity-50"
          >
            {busy ? "שומר..." : "שמירת ההוצאות"}
          </button>
        </div>
      </div>
    </div>
  );
}
