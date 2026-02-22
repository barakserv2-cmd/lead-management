"use client";

import { useState, useEffect, useRef } from "react";
import { updateLeadStatus, updateLeadStatusWithRole, getActiveClients, getOpenJobs } from "./actions";

interface LeadCard {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  status: string;
}

const BOARD_COLUMNS = [
  { value: "חדש", label: "חדש", headerColor: "bg-blue-500" },
  { value: "מעורב", label: "נוצר קשר", headerColor: "bg-cyan-500" },
  { value: "בסינון", label: "בסינון", headerColor: "bg-yellow-500" },
  { value: "מתאים", label: "מתאים", headerColor: "bg-emerald-500" },
  { value: "התקבל", label: "התקבל", headerColor: "bg-purple-600" },
  { value: "נדחה", label: "נדחה", headerColor: "bg-red-500" },
];

const SOURCE_COLORS: Record<string, string> = {
  "AllJobs": "bg-blue-100 text-blue-700",
  "אימייל ישיר": "bg-violet-100 text-violet-700",
  "וואטסאפ": "bg-green-100 text-green-700",
  "טלפון": "bg-amber-100 text-amber-700",
  "אחר": "bg-gray-100 text-gray-600",
  "Facebook": "bg-indigo-100 text-indigo-700",
  "Website": "bg-teal-100 text-teal-700",
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.slice(0, 2);
}

type JobOption = { id: string; title: string; client_id: string; clients: { name: string } | null };

export function BoardView({ leads: initialLeads, onSelectLead }: { leads: LeadCard[]; onSelectLead?: (id: string) => void }) {
  const [leads, setLeads] = useState(initialLeads);
  const [dragging, setDragging] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Modal state for "התקבל" drop
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [pendingLead, setPendingLead] = useState<{ id: string; prevStatus: string } | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientValue, setClientValue] = useState("");
  const [roleValue, setRoleValue] = useState("");
  const [customRole, setCustomRole] = useState(false);
  const [customClient, setCustomClient] = useState(false);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const customRoleRef = useRef<HTMLInputElement>(null);
  const customClientRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (roleModalOpen) {
      Promise.all([getOpenJobs(), getActiveClients()]).then(([jobRes, clientRes]) => {
        setJobs(jobRes.jobs as JobOption[]);
        setClients(clientRes.clients);
      });
    }
  }, [roleModalOpen]);

  useEffect(() => { if (customRole && customRoleRef.current) customRoleRef.current.focus(); }, [customRole]);
  useEffect(() => { if (customClient && customClientRef.current) customClientRef.current.focus(); }, [customClient]);

  function handleDragStart(leadId: string) {
    setDragging(leadId);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function handleDrop(columnValue: string) {
    if (!dragging) return;
    const lead = leads.find((l) => l.id === dragging);
    if (!lead || lead.status === columnValue) {
      setDragging(null);
      return;
    }

    // Intercept drop on "התקבל" — show modal instead of saving
    if (columnValue === "התקבל") {
      setPendingLead({ id: lead.id, prevStatus: lead.status });
      setLeads((prev) => prev.map((l) => (l.id === dragging ? { ...l, status: "התקבל" } : l)));
      setDragging(null);
      setSelectedClientId("");
      setClientValue("");
      setRoleValue("");
      setCustomRole(false);
      setCustomClient(false);
      setRoleModalOpen(true);
      return;
    }

    setLeads((prev) =>
      prev.map((l) => (l.id === dragging ? { ...l, status: columnValue } : l))
    );
    setDragging(null);

    const result = await updateLeadStatus(dragging, columnValue);
    if (result.error) {
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status: lead.status } : l))
      );
      setToast(`שגיאה: ${result.error}`);
    } else {
      setToast("הסטטוס עודכן");
    }
    setTimeout(() => setToast(null), 2500);
  }

  // Modal helpers
  function handleClientSelect(value: string) {
    if (value === "__custom__") {
      setCustomClient(true);
      setClientValue("");
      setSelectedClientId("");
    } else {
      setCustomClient(false);
      const client = clients.find((c) => c.id === value);
      setSelectedClientId(value);
      setClientValue(client?.name ?? "");
    }
    setRoleValue("");
    setCustomRole(false);
  }

  function handleJobSelect(value: string) {
    if (value === "__custom__") { setCustomRole(true); setRoleValue(""); return; }
    setCustomRole(false);
    const job = jobs.find((j) => j.id === value);
    if (job) setRoleValue(job.title);
  }

  const filteredJobs = selectedClientId ? jobs.filter((j) => j.client_id === selectedClientId) : [];
  const jobsDisabled = !selectedClientId && !customClient;
  const selectedJobId = !customRole ? (filteredJobs.find((j) => j.title === roleValue)?.id ?? "") : "__custom__";
  const selectedClientDropdown = !customClient ? selectedClientId : "__custom__";

  async function handleRoleConfirm() {
    if (!pendingLead || !roleValue.trim() || !clientValue.trim()) return;
    setRoleModalOpen(false);
    const result = await updateLeadStatusWithRole(pendingLead.id, "התקבל", roleValue.trim(), clientValue.trim());
    if (result.error) {
      setLeads((prev) => prev.map((l) => (l.id === pendingLead.id ? { ...l, status: pendingLead.prevStatus } : l)));
      setToast(`שגיאה: ${result.error}`);
    } else {
      setToast(`התקבל — ${roleValue.trim()} @ ${clientValue.trim()}`);
    }
    setPendingLead(null);
    setTimeout(() => setToast(null), 2500);
  }

  function handleRoleCancel() {
    setRoleModalOpen(false);
    if (pendingLead) {
      setLeads((prev) => prev.map((l) => (l.id === pendingLead.id ? { ...l, status: pendingLead.prevStatus } : l)));
      setPendingLead(null);
    }
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((col) => {
          const columnLeads = leads.filter((l) => l.status === col.value);
          return (
            <div
              key={col.value}
              className="flex-shrink-0 w-72 bg-gray-50 rounded-xl border border-gray-200 flex flex-col"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(col.value)}
            >
              <div className={`${col.headerColor} rounded-t-xl px-4 py-2.5 flex items-center justify-between`}>
                <span className="text-white font-semibold text-sm">{col.label}</span>
                <span className="bg-white/25 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {columnLeads.length}
                </span>
              </div>
              <div className="p-2 flex flex-col gap-2 flex-1 min-h-[200px]">
                {columnLeads.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center mt-8">אין לידים</p>
                ) : (
                  columnLeads.map((lead) => {
                    const srcColor = SOURCE_COLORS[lead.source] ?? "bg-gray-100 text-gray-600";
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={() => handleDragStart(lead.id)}
                        className={`bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${dragging === lead.id ? "opacity-40" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectLead?.(lead.id)}
                          className="flex items-center gap-2 mb-2 hover:opacity-80 text-right w-full"
                        >
                          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                            {getInitials(lead.name)}
                          </span>
                          <span className="text-sm font-semibold text-gray-900 truncate">
                            {lead.name}
                          </span>
                        </button>
                        <div className="flex items-center justify-between">
                          {lead.phone ? (
                            <span className="text-xs text-gray-500" dir="ltr">{lead.phone}</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${srcColor}`}>
                            {lead.source}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Role + Client Modal for "התקבל" */}
      {roleModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={handleRoleCancel}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">שיוך ליד למשרה</h3>
            <p className="text-xs text-gray-500 mb-4">בחר לקוח, ואז בחר משרה מהרשימה המסוננת</p>

            <label className="block text-sm font-semibold text-gray-900 mb-1">לקוח</label>
            <select
              value={selectedClientDropdown}
              onChange={(e) => handleClientSelect(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-2 bg-white"
            >
              <option value="">— בחר לקוח —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value="__custom__">+ הוסף ידנית...</option>
            </select>
            {customClient && (
              <input
                ref={customClientRef}
                type="text"
                value={clientValue}
                onChange={(e) => setClientValue(e.target.value)}
                placeholder="הקלד שם לקוח..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-2"
              />
            )}

            <label className="block text-sm font-semibold text-gray-900 mb-1 mt-3">משרה</label>
            <select
              value={selectedJobId}
              onChange={(e) => handleJobSelect(e.target.value)}
              disabled={jobsDisabled}
              className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-2 bg-white ${jobsDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <option value="">{jobsDisabled ? "— בחר לקוח קודם —" : "— בחר משרה —"}</option>
              {filteredJobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
              <option value="__custom__">+ הוסף ידנית...</option>
            </select>
            {customRole && (
              <input
                ref={customRoleRef}
                type="text"
                value={roleValue}
                onChange={(e) => setRoleValue(e.target.value)}
                placeholder="הקלד שם משרה..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-2"
              />
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleRoleConfirm}
                disabled={!roleValue.trim() || !clientValue.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                אישור
              </button>
              <button
                type="button"
                onClick={handleRoleCancel}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
