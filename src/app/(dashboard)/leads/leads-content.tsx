"use client";

import { useState } from "react";
import type { Lead } from "@/types/leads";
import { StatusSelect } from "./status-select";
import { ViewToggle } from "./view-toggle";
import { BoardView } from "./board-view";
import { LeadSheet, type SheetLead } from "./lead-sheet";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.slice(0, 2);
}

function PhoneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
      <path d="M15 3v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "972");
}

const SOURCE_COLORS: Record<string, string> = {
  AllJobs: "bg-blue-100 text-blue-700",
  "אימייל ישיר": "bg-violet-100 text-violet-700",
  "וואטסאפ": "bg-green-100 text-green-700",
  "טלפון": "bg-amber-100 text-amber-700",
  "אחר": "bg-gray-100 text-gray-600",
  Facebook: "bg-indigo-100 text-indigo-700",
  Website: "bg-teal-100 text-teal-700",
};

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = d.toLocaleDateString("he-IL", { month: "short" });
  return day + " " + month;
}

export function LeadsContent({ leads }: { leads: Lead[] }) {
  const [selectedLead, setSelectedLead] = useState<SheetLead | null>(null);

  const boardLeads = leads.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    source: l.source,
    status: l.status,
  }));

  const tableView = (
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
            <th className="px-4 py-3 text-right font-medium text-gray-600">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                אין לידים עדיין. חבר את Gmail כדי להתחיל.
              </td>
            </tr>
          ) : (
            leads.map((lead) => {
              const intlPhone = formatPhone(lead.phone);
              const sourceColor = SOURCE_COLORS[lead.source] ?? "bg-gray-100 text-gray-600";
              return (
                <tr key={lead.id} className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors duration-150">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedLead(lead)}
                      className="flex items-center gap-2.5 hover:opacity-80 text-right"
                    >
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                        {getInitials(lead.name)}
                      </span>
                      <span className="text-gray-900 hover:text-blue-600 font-semibold">
                        {lead.name}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600" dir="ltr">{lead.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{lead.job_title ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusSelect leadId={lead.id} currentStatus={lead.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={"inline-block px-2.5 py-1 rounded-full text-xs font-medium " + sourceColor}>
                      {lead.source ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      {formatShortDate(lead.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedLead(lead)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="הערות ופרטים"
                      >
                        <NotesIcon />
                      </button>
                      {intlPhone ? (
                        <>
                          <a
                            href={"tel:" + lead.phone}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="התקשר"
                          >
                            <PhoneIcon />
                          </a>
                          <a
                            href={"https://api.whatsapp.com/send?phone=" + intlPhone}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                            title="WhatsApp"
                          >
                            <WhatsAppIcon />
                          </a>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <ViewToggle
        listView={tableView}
        boardView={<BoardView leads={boardLeads} onSelectLead={(id) => {
          const lead = leads.find((l) => l.id === id);
          if (lead) setSelectedLead(lead);
        }} />}
      />
      <LeadSheet lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </>
  );
}
