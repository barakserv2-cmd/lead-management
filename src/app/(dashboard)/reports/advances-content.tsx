"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type AdvanceReason = "requested" | "self_rent" | "stopped_working";
export const REASON_LABELS: Record<AdvanceReason, string> = {
  requested: "ביקש/ה ניכוי לשכירות",
  self_rent: "שוכר/ת דירה לבד",
  stopped_working: "הפסיק/ה להגיע — נשאר/ה במגורים",
};
const REASON_STYLE: Record<AdvanceReason, string> = {
  requested: "bg-blue-50 text-blue-700",
  self_rent: "bg-violet-50 text-violet-700",
  stopped_working: "bg-red-50 text-red-700",
};

export interface AdvanceRow {
  id: string;
  lead_id: string;
  amount: number;
  paid_at: string; // YYYY-MM-DD
  employer: string | null;
  notes: string | null;
  reason: AdvanceReason;
  created_by: string | null;
  name: string;
  phone: string | null;
  position: string | null;
  start_date: string | null;
}

export interface WorkerOption {
  id: string;
  name: string;
  phone: string | null;
  hired_client: string | null;
  hired_position: string | null;
  job_title: string | null;
  start_date: string | null;
}

const ILS = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

function ilDate(d: string | null) {
  if (!d) return "—";
  return new Date(`${d}T12:00:00`).toLocaleDateString("he-IL");
}
function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

export function AdvancesContent({ rows, workers, loadError }: { rows: AdvanceRow[]; workers: WorkerOption[]; loadError: string | null }) {
  const router = useRouter();
  const [employer, setEmployer] = useState("");
  const [reasonF, setReasonF] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // add form
  const [showForm, setShowForm] = useState(false);
  const [workerQ, setWorkerQ] = useState("");
  const [leadId, setLeadId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState<AdvanceReason>("requested");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const employerOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.employer).filter((x): x is string => !!x))).sort(), [rows]);

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (employer && r.employer !== employer) return false;
      if (reasonF && r.reason !== reasonF) return false;
      if (from && r.paid_at < from) return false;
      if (to && r.paid_at > to) return false;
      if (qn && !`${r.name} ${r.phone ?? ""} ${r.employer ?? ""} ${r.notes ?? ""}`.toLowerCase().includes(qn)) return false;
      return true;
    });
  }, [rows, employer, reasonF, q, from, to]);

  const total = filtered.reduce((a, r) => a + r.amount, 0);
  const perWorker = useMemo(() => {
    const m = new Map<string, { name: string; count: number; total: number }>();
    for (const r of filtered) {
      const e = m.get(r.lead_id) ?? { name: r.name, count: 0, total: 0 };
      e.count++;
      e.total += r.amount;
      m.set(r.lead_id, e);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const workerMatches = useMemo(() => {
    const s = workerQ.trim().toLowerCase();
    if (!s) return workers.slice(0, 8);
    return workers.filter((w) => `${w.name} ${w.phone ?? ""} ${w.hired_client ?? ""}`.toLowerCase().includes(s)).slice(0, 8);
  }, [workers, workerQ]);
  const selectedWorker = workers.find((w) => w.id === leadId) ?? null;

  async function submit() {
    setErr(null);
    if (!leadId) return setErr("בחרי עובד/ת");
    if (!(Number(amount) > 0)) return setErr("סכום חייב להיות גדול מ-0");
    setSaving(true);
    try {
      const res = await fetch("/api/reports/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, amount: Number(amount), paid_at: paidAt, notes, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "שגיאה");
      setLeadId(""); setWorkerQ(""); setAmount(""); setNotes(""); setReason("requested"); setShowForm(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק את הרישום?")) return;
    const res = await fetch(`/api/reports/advances?id=${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  const exportUrl = (() => {
    const p = new URLSearchParams({ type: "advances" });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (employer) p.set("client", employer);
    return `/api/assistant/export?${p.toString()}`;
  })();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">דוח מקדמות לדיור</h1>
          <p className="text-sm text-gray-500 mt-1">עובדים שמסומנים לשכר לניכוי סכום מהמשכורת לטובת השכירות/המגורים.</p>
        </div>
        <div className="flex gap-2">
          <a href={exportUrl} className="text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50">⬇ ייצוא לאקסל</a>
          <button type="button" onClick={() => setShowForm((v) => !v)} className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold">
            + סימון עובד/ת לניכוי
          </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          לא ניתן לטעון את טבלת המקדמות ({loadError}). כנראה המיגרציה <code>00038_advances_and_job_transfers.sql</code> עדיין לא הורצה ב-Supabase.
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 mb-6 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2 relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">עובד/ת (מועסקים בלבד)</label>
              {selectedWorker ? (
                <div className="flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50">
                  <span>
                    <b>{selectedWorker.name}</b> · {selectedWorker.phone ?? "—"} · {selectedWorker.hired_client ?? "ללא מעסיק"}
                  </span>
                  <button type="button" onClick={() => setLeadId("")} className="text-gray-400 hover:text-gray-700 text-xs">שנה</button>
                </div>
              ) : (
                <>
                  <input
                    value={workerQ}
                    onChange={(e) => setWorkerQ(e.target.value)}
                    placeholder="חיפוש לפי שם / טלפון / מעסיק…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    autoFocus
                  />
                  {workerMatches.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {workerMatches.map((w) => (
                        <li key={w.id}>
                          <button type="button" onClick={() => setLeadId(w.id)} className="w-full text-right px-3 py-2 text-sm hover:bg-blue-50">
                            <b>{w.name}</b> <span className="text-gray-500">· {w.phone ?? "—"} · {w.hired_client ?? "ללא מעסיק"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סכום לניכוי (₪)</label>
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך / חודש שכר</label>
              <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">סיבה</label>
              <select value={reason} onChange={(e) => setReason(e.target.value as AdvanceReason)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {(Object.keys(REASON_LABELS) as AdvanceReason[]).map((k) => <option key={k} value={k}>{REASON_LABELS[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">הערה</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="אופציונלי" />
            </div>
            <div className="flex items-end gap-2">
              <button type="button" onClick={submit} disabled={saving} className="flex-1 text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-semibold">
                {saving ? "שומר…" : "שמור"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-sm px-3 py-2 rounded-lg border border-gray-300">ביטול</button>
            </div>
          </div>
          {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
        </div>
      )}

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl px-5 py-4">
          <div className="text-2xl font-bold text-cyan-700">{ILS.format(total)}</div>
          <div className="text-sm text-cyan-700">סה&quot;כ לניכוי (בסינון)</div>
        </div>
        <div className="bg-white border rounded-xl px-5 py-4">
          <div className="text-2xl font-bold text-gray-800">{filtered.length}</div>
          <div className="text-sm text-gray-500">רישומים</div>
        </div>
        <div className="bg-white border rounded-xl px-5 py-4">
          <div className="text-2xl font-bold text-gray-800">{perWorker.length}</div>
          <div className="text-sm text-gray-500">עובדים</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם / טלפון…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[200px]" />
        <select value={employer} onChange={(e) => setEmployer(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">כל המעסיקים</option>
          {employerOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={reasonF} onChange={(e) => setReasonF(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">כל הסיבות</option>
          {(Object.keys(REASON_LABELS) as AdvanceReason[]).map((k) => <option key={k} value={k}>{REASON_LABELS[k]}</option>)}
        </select>
        <div>
          <label className="block text-xs text-gray-500 mb-1">מתאריך</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">עד תאריך</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">אין רישומים להצגה. לחצי &quot;סימון עובד/ת לניכוי&quot; כדי להוסיף.</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-right">
                  <th className="px-4 py-3 font-semibold text-gray-700">תאריך</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">שם</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">טלפון</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">מעסיק</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">תפקיד</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">סכום לניכוי</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">סיבה</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">הערה</th>
                  <th className="px-2 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{ilDate(r.paid_at)}</td>
                    <td className="px-4 py-3 font-medium"><Link href={`/leads/${r.lead_id}`} className="hover:text-blue-700 hover:underline">{r.name}</Link></td>
                    <td className="px-4 py-3 text-gray-600" dir="ltr">{r.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{r.employer ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{r.position ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{ILS.format(r.amount)}</td>
                    <td className="px-4 py-3"><span className={`text-xs rounded-full px-2 py-0.5 whitespace-nowrap ${REASON_STYLE[r.reason]}`}>{REASON_LABELS[r.reason]}</span></td>
                    <td className="px-4 py-3 text-gray-500 max-w-[220px] truncate" title={r.notes ?? ""}>{r.notes ?? ""}</td>
                    <td className="px-2 py-3"><button type="button" onClick={() => remove(r.id)} className="text-xs text-gray-400 hover:text-red-600" title="מחיקה">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 h-fit">
            <h3 className="font-semibold text-gray-800 mb-3">סיכום לפי עובד</h3>
            <ul className="divide-y text-sm">
              {perWorker.map((w) => (
                <li key={w.name} className="flex items-center justify-between py-2">
                  <span className="truncate">{w.name} <span className="text-gray-400 text-xs">×{w.count}</span></span>
                  <span className="font-semibold whitespace-nowrap">{ILS.format(w.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
