"use client";

import { useState, useMemo } from "react";
import type { Lead } from "@/types/leads";

export function HiredContent({ leads }: { leads: Lead[] }) {
  const [clientFilter, setClientFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Derive unique clients from actual matched_client data
  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      const client = (l.preferences as Record<string, unknown>)?.matched_client;
      if (typeof client === "string" && client) set.add(client);
    });
    return Array.from(set).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    let result = leads;

    if (clientFilter) {
      result = result.filter(
        (l) =>
          (l.preferences as Record<string, unknown>)?.matched_client ===
          clientFilter
      );
    }

    if (dateFrom) {
      result = result.filter(
        (l) => l.created_at.slice(0, 10) >= dateFrom
      );
    }

    if (dateTo) {
      result = result.filter(
        (l) => l.created_at.slice(0, 10) <= dateTo
      );
    }

    return result;
  }, [leads, clientFilter, dateFrom, dateTo]);

  return (
    <div dir="rtl">
      {/* Header */}
      <h1 className="text-2xl font-bold mb-6">דוח מועסקים</h1>

      {/* Summary Card */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl px-6 py-4 mb-6 flex items-center gap-3">
        <span className="text-3xl font-bold text-purple-700">
          {filtered.length}
        </span>
        <span className="text-purple-700 font-medium">סה&quot;כ התקבלו</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            לקוח
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
                <th className="px-4 py-3 font-semibold text-gray-700">לקוח</th>
                <th className="px-4 py-3 font-semibold text-gray-700">תפקיד</th>
                <th className="px-4 py-3 font-semibold text-gray-700">תאריך</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((lead) => {
                const prefs = lead.preferences as Record<string, unknown> | null;
                return (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{lead.name}</td>
                    <td className="px-4 py-3 text-gray-600" dir="ltr">
                      {lead.phone}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {(prefs?.matched_client as string) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {lead.job_title ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(lead.created_at).toLocaleDateString("he-IL")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
