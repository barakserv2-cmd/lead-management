import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATUS_COLORS } from "@/lib/constants";
import type { Lead } from "@/types/leads";
import type { LeadStatus } from "@/lib/constants";

export default async function LeadsPage() {
  const supabase = await createClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const typedLeads = (leads ?? []) as Lead[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">לידים</h1>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="חיפוש..."
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-right font-medium text-gray-600">שם</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">טלפון</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">תפקיד</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">סטטוס</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">מקור</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">תאריך</th>
            </tr>
          </thead>
          <tbody>
            {typedLeads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  אין לידים עדיין. חבר את Gmail כדי להתחיל.
                </td>
              </tr>
            ) : (
              typedLeads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="text-blue-600 hover:underline font-medium">
                      {lead.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600" dir="ltr">{lead.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{lead.job_title ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status as LeadStatus] ?? "bg-gray-100 text-gray-800"}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{lead.source ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(lead.created_at).toLocaleDateString("he-IL")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
