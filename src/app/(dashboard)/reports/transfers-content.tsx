"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WorkerOption } from "./advances-content";

export interface TransferRow {
  id: string;
  lead_id: string;
  from_client: string | null;
  from_position: string | null;
  to_client: string | null;
  to_position: string | null;
  transferred_at: string; // YYYY-MM-DD
  reason: string | null;
  source: string; // manual | auto
  created_by: string | null;
  name: string;
  phone: string | null;
}

function ilDate(d: string | null) {
  if (!d) return "—";
  return new Date(`${d}T12:00:00`).toLocaleDateString("he-IL");
}
function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

export function TransfersContent({
  rows,
  workers,
  clientNames,
  loadError,
}: {
  rows: TransferRow[];
  workers: WorkerOption[];
  clientNames: string[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [clientF, setClientF] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [workerQ, setWorkerQ] = useState("");
  const [leadId, setLeadId] = useState("");
  const [toClient, setToClient] = useState("");
  const [toPosition, setToPosition] = useState("");
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [applyToLead, setApplyToLead] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const clientOptions = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => [r.from_client, r.to_client]).filter((x): x is string => !!x))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (clientF && r.from_client !== clientF && r.to_client !== clientF) return false;
      if (from && r.transferred_at < from) return false;
      if (to && r.transferred_at > to) return false;
      if (qn && !`${r.name} ${r.phone ?? ""} ${r.from_client ?? ""} ${r.to_client ?? ""} ${r.reason ?? ""}`.toLowerCase().includes(qn)) return false;
      return true;
    });
  }, [rows, q, clientF, from, to]);

  const workerMatches = useMemo(() => {
    const s = workerQ.trim().toLowerCase();
    if (!s) return workers.slice(0, 8);
    return workers.filter((w) => `${w.name} ${w.phone ?? ""} ${w.hired_client ?? ""}`.toLowerCase().includes(s)).slice(0, 8);
  }, [workers, workerQ]);
  const selectedWorker = workers.find((w) => w.id === leadId) ?? null;

  async function submit() {
    setErr(null);
    if (!leadId) return setErr("בחרי עובד/ת");
    if (!toClient.trim()) return setErr("בחרי מעסיק יעד");
    setSaving(true);
    try {
      const res = await fetch("/api/reports/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, to_client: toClient, to_position: toPosition, transferred_at: date, reason, apply_to_lead: applyToLead }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "שגיאה");
      setLeadId(""); setWorkerQ(""); setToClient(""); setToPosition(""); setReason(""); setShowForm(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק את רשומת ההעברה? (לא משנה את המעסיק בכרטיס)")) return;
    const res = await fetch(`/api/reports/transfers?id=${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  const exportUrl = (() => {
    const p = new URLSearchParams({ type: "transfers" });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (clientF) p.set("client", clientF);
    return `/api/assistant/export?${p.toString()}`;
  })();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">דוח העברות בין עבודות</h1>
          <p className="text-sm text-gray-500 mt-1">נרשם אוטומטית כשמשנים מעסיק/תפקיד לעובד מועסק, או ידנית מכאן.</p>
        </div>
        <div className="flex gap-2">
          <a href={exportUrl} className="text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50">⬇ ייצוא לאקסל</a>
          <button type="button" onClick={() => setShowForm((v) => !v)} className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold">
            + רישום העברה
          </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          לא ניתן לטעון את טבלת ההעברות ({loadError}). כנראה המיגרציה <code>00038_advances_and_job_transfers.sql</code> עדיין לא הורצה ב-Supabase.
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 mb-6 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2 relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">עובד/ת</label>
              {selectedWorker ? (
                <div className="flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50">
                  <span><b>{selectedWorker.name}</b> · {selectedWorker.phone ?? "—"} · כרגע: {selectedWorker.hired_client ?? "ללא מעסיק"}{selectedWorker.hired_position ? ` (${selectedWorker.hired_position})` : ""}</span>
                  <button type="button" onClick={() => setLeadId("")} className="text-gray-400 hover:text-gray-700 text-xs">שנה</button>
                </div>
              ) : (
                <>
                  <input value={workerQ} onChange={(e) => setWorkerQ(e.target.value)} placeholder="חיפוש לפי שם / טלפון / מעסיק…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" autoFocus />
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
              <label className="block text-sm font-medium text-gray-700 mb-1">למעסיק</label>
              <input list="transfer-clients" value={toClient} onChange={(e) => setToClient(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="בחרי או הקלידי" />
              <datalist id="transfer-clients">
                {clientNames.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">לתפקיד</label>
              <input value={toPosition} onChange={(e) => setToPosition(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="אופציונלי" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך העברה</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">סיבה</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="אופציונלי" />
            </div>
            <div className="flex items-end gap-2">
              <button type="button" onClick={submit} disabled={saving} className="flex-1 text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-semibold">
                {saving ? "שומר…" : "שמור"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-sm px-3 py-2 rounded-lg border border-gray-300">ביטול</button>
            </div>
            <label className="md:col-span-4 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={applyToLead} onChange={(e) => setApplyToLead(e.target.checked)} />
              לעדכן גם את המעסיק/תפקיד בכרטיס העובד
            </label>
          </div>
          {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם / טלפון / מעסיק…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[200px]" />
        <select value={clientF} onChange={(e) => setClientF(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">כל המעסיקים</option>
          {clientOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <div>
          <label className="block text-xs text-gray-500 mb-1">מתאריך</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">עד תאריך</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <span className="text-sm text-gray-500 mr-auto">{filtered.length} העברות</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">אין העברות להצגה.</div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-right">
                <th className="px-4 py-3 font-semibold text-gray-700">תאריך</th>
                <th className="px-4 py-3 font-semibold text-gray-700">שם</th>
                <th className="px-4 py-3 font-semibold text-gray-700">טלפון</th>
                <th className="px-4 py-3 font-semibold text-gray-700">מ־</th>
                <th className="px-4 py-3 font-semibold text-gray-700">ל־</th>
                <th className="px-4 py-3 font-semibold text-gray-700">סיבה</th>
                <th className="px-4 py-3 font-semibold text-gray-700">מקור</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{ilDate(r.transferred_at)}</td>
                  <td className="px-4 py-3 font-medium"><Link href={`/leads/${r.lead_id}`} className="hover:text-blue-700 hover:underline">{r.name}</Link></td>
                  <td className="px-4 py-3 text-gray-600" dir="ltr">{r.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{r.from_client ?? "—"}{r.from_position ? <span className="text-gray-400"> · {r.from_position}</span> : null}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{r.to_client ?? "—"}{r.to_position ? <span className="text-gray-500 font-normal"> · {r.to_position}</span> : null}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[220px] truncate" title={r.reason ?? ""}>{r.reason ?? ""}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${r.source === "auto" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"}`}>
                      {r.source === "auto" ? "אוטומטי" : "ידני"}
                    </span>
                  </td>
                  <td className="px-2 py-3"><button type="button" onClick={() => remove(r.id)} className="text-xs text-gray-400 hover:text-red-600" title="מחיקה">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
