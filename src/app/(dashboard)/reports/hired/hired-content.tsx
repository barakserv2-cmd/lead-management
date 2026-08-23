"use client";

import { useState, useMemo } from "react";
import type { Lead } from "@/types/leads";
import { StatusSelect } from "../../leads/status-select";
import { LeadStatus, type LeadStatusValue } from "@/lib/stateMachine";

// בדוח המועסקים מציגים רק את שלושת מצבי ההעסקה
const HIRED_REPORT_STATUSES: LeadStatusValue[] = [
  LeadStatus.HIRED,
  LeadStatus.STARTED,
  LeadStatus.EMPLOYMENT_ENDED,
];

// המעסיק האמיתי: hired_client (נקבע בקבלה), עם fallback להתאמת הסוכן.
function employerOf(lead: Lead): string | null {
  return (
    lead.hired_client ??
    ((lead.preferences as Record<string, unknown>)?.matched_client as string | undefined) ??
    null
  );
}

export function HiredContent({
  leads,
  hiredAt = {},
}: {
  leads: Lead[];
  /** lead_id → מועד המעבר ל"התקבל" (מהיסטוריית הסטטוסים) */
  hiredAt?: Record<string, string>;
}) {
  const [clientFilter, setClientFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Derive unique clients from actual employer data
  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      const client = employerOf(l);
      if (client) set.add(client);
    });
    return Array.from(set).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    let result = leads;

    if (clientFilter) {
      result = result.filter((l) => employerOf(l) === clientFilter);
    }

    // סינון תאריכים לפי מועד הקבלה (fallback: יצירת הליד)
    const hiredDate = (l: Lead) => (hiredAt[l.id] ?? l.created_at).slice(0, 10);
    if (dateFrom) {
      result = result.filter((l) => hiredDate(l) >= dateFrom);
    }

    if (dateTo) {
      result = result.filter((l) => hiredDate(l) <= dateTo);
    }

    return result;
  }, [leads, hiredAt, clientFilter, dateFrom, dateTo]);

  return (
    <div dir="rtl">
      {/* Header */}
      <h1 className="text-2xl font-bold mb-6">דוח מועסקים</h1>

      {/* Summary Card */}
      <div className="bg-cyan-50 border border-cyan-200 rounded-xl px-6 py-4 mb-6 flex items-center gap-3 flex-wrap">
        <span className="text-3xl font-bold text-cyan-700">
          {filtered.length}
        </span>
        <span className="text-cyan-700 font-medium">סה&quot;כ התקבלו</span>
        {filtered.some((l) => l.status === "EMPLOYMENT_ENDED") && (
          <span className="text-sm text-cyan-700/80 border-r border-cyan-200 pr-3 mr-1">
            מועסקים כעת {filtered.filter((l) => l.status !== "EMPLOYMENT_ENDED").length}
            {" · "}
            סיימו העסקה {filtered.filter((l) => l.status === "EMPLOYMENT_ENDED").length}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            מעסיק
          </label>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[180px]"
          >
            <option value="">הכל</option>
            {clientOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            מתאריך
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            עד תאריך
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📈</span>
          </div>
          <p className="text-gray-500 font-medium">אין נתונים להצגה</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-right">
                <th className="px-4 py-3 font-semibold text-gray-700">שם</th>
                <th className="px-4 py-3 font-semibold text-gray-700">טלפון</th>
                <th className="px-4 py-3 font-semibold text-gray-700">מעסיק</th>
                <th className="px-4 py-3 font-semibold text-gray-700">תפקיד</th>
                <th className="px-4 py-3 font-semibold text-gray-700">סטטוס</th>
                <th className="px-4 py-3 font-semibold text-gray-700">תאריך קבלה</th>
                <th className="px-4 py-3 font-semibold text-gray-700">תחילת עבודה</th>
                <th className="px-4 py-3 font-semibold text-gray-700">סיום העסקה</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{lead.name}</td>
                  {/* dir=ltr לספרות, text-right כדי שהמספר יישב בצד של העמודה ולא יברח שמאלה */}
                  <td className="px-4 py-3 text-gray-600 text-right tabular-nums" dir="ltr">
                    {lead.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {employerOf(lead) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {lead.hired_position ?? lead.job_title ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusSelect
                      leadId={lead.id}
                      currentStatus={lead.status}
                      currentSubStatus={lead.sub_status}
                      allowedStatuses={HIRED_REPORT_STATUSES}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {hiredAt[lead.id]
                      ? new Date(hiredAt[lead.id]).toLocaleDateString("he-IL")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {lead.start_date
                      ? new Date(lead.start_date).toLocaleDateString("he-IL")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {lead.employment_end_date ? (
                      <span className="text-slate-600 font-medium">
                        {new Date(lead.employment_end_date).toLocaleDateString("he-IL")}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
