"use client";

import { useState, useRef, useEffect } from "react";
import { updateLeadStatus, updateLeadStatusWithRole, getActiveClients, getOpenJobs } from "./actions";

const QUICK_STATUSES = [
  { value: "חדש", label: "חדש", color: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  { value: "מעורב", label: "נוצר קשר", color: "bg-cyan-100 text-cyan-800", dot: "bg-cyan-500" },
  { value: "בסינון", label: "בסינון", color: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-500" },
  { value: "מתאים", label: "מתאים", color: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  { value: "נדחה", label: "נדחה", color: "bg-red-100 text-red-800", dot: "bg-red-500" },
];

function getStatusStyle(status: string) {
  return QUICK_STATUSES.find((s) => s.value === status) ?? {
    value: status,
    label: status,
    color: "bg-gray-100 text-gray-800",
    dot: "bg-gray-500",
  };
}

type JobOption = { id: string; title: string; client_id: string; clients: { name: string } | null };

export function StatusSelect({ leadId, currentStatus }: { leadId: string; currentStatus: string }) {
  const [status, setStatus] = useState(currentStatus);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  // Modal form state
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientValue, setClientValue] = useState("");
  const [roleValue, setRoleValue] = useState("");
  const [customRole, setCustomRole] = useState(false);
  const [customClient, setCustomClient] = useState(false);

  // DB data
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  const ref = useRef<HTMLDivElement>(null);
  const customRoleRef = useRef<HTMLInputElement>(null);
  const customClientRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (roleModalOpen) {
      Promise.all([getOpenJobs(), getActiveClients()]).then(([jobRes, clientRes]) => {
        setJobs(jobRes.jobs as JobOption[]);
        setClients(clientRes.clients);
      });
    }
  }, [roleModalOpen]);

  useEffect(() => {
    if (customRole && customRoleRef.current) customRoleRef.current.focus();
  }, [customRole]);

  useEffect(() => {
    if (customClient && customClientRef.current) customClientRef.current.focus();
  }, [customClient]);

  const current = getStatusStyle(status);

  async function handleSelect(newStatus: string) {
    if (newStatus === status) {
      setOpen(false);
      return;
    }

    if (newStatus === "מתאים") {
      setOpen(false);
      setSelectedClientId("");
      setClientValue("");
      setRoleValue("");
      setCustomRole(false);
      setCustomClient(false);
      setRoleModalOpen(true);
      return;
    }

    setLoading(true);
    setOpen(false);
    const result = await updateLeadStatus(leadId, newStatus);
    setLoading(false);

    if (result.error) {
      setToast(`שגיאה: ${result.error}`);
    } else {
      setStatus(newStatus);
      setToast("הסטטוס עודכן");
    }
  }

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
    // Reset job selection when client changes
    setRoleValue("");
    setCustomRole(false);
  }

  function handleJobSelect(value: string) {
    if (value === "__custom__") {
      setCustomRole(true);
      setRoleValue("");
      return;
    }
    setCustomRole(false);
    const job = jobs.find((j) => j.id === value);
    if (job) {
      setRoleValue(job.title);
    }
  }

  // Filter jobs by selected client
  const filteredJobs = selectedClientId
    ? jobs.filter((j) => j.client_id === selectedClientId)
    : [];
  const jobsDisabled = !selectedClientId && !customClient;

  async function handleRoleConfirm() {
    const trimmedRole = roleValue.trim();
    const trimmedClient = clientValue.trim();
    if (!trimmedRole || !trimmedClient) return;

    setRoleModalOpen(false);
    setLoading(true);

    const result = await updateLeadStatusWithRole(leadId, "מתאים", trimmedRole, trimmedClient);

    setLoading(false);

    if (result.error) {
      setToast(`שגיאה: ${result.error}`);
    } else {
      setStatus("מתאים");
      setToast(`עודכן למתאים — ${trimmedRole} @ ${trimmedClient}`);
    }
  }

  function handleRoleCancel() {
    setRoleModalOpen(false);
    setSelectedClientId("");
    setClientValue("");
    setRoleValue("");
    setCustomRole(false);
    setCustomClient(false);
  }

  // Computed dropdown values
  const selectedJobId = !customRole ? (filteredJobs.find((j) => j.title === roleValue)?.id ?? "") : "__custom__";
  const selectedClientDropdown = !customClient ? selectedClientId : "__custom__";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 ${current.color} ${loading ? "opacity-50" : ""}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
        {current.label}
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 right-0 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in">
          {QUICK_STATUSES.map((s) => {
            const isActive = s.value === status;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => handleSelect(s.value)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-right hover:bg-gray-50 transition-colors ${isActive ? "bg-gray-50 font-semibold" : ""}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                {s.label}
                {isActive && (
                  <svg className="w-3 h-3 mr-auto text-blue-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Role + Client Modal */}
      {roleModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={handleRoleCancel}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">שיוך ליד למשרה</h3>
            <p className="text-xs text-gray-500 mb-4">בחר לקוח, ואז בחר משרה מהרשימה המסוננת</p>

            {/* Client (first) */}
            <label className="block text-sm font-semibold text-gray-900 mb-1">לקוח</label>
            <select
              value={selectedClientDropdown}
              onChange={(e) => handleClientSelect(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 mb-2 bg-white"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 mb-2"
              />
            )}

            {/* Job / Role (filtered by client) */}
            <label className="block text-sm font-semibold text-gray-900 mb-1 mt-3">משרה</label>
            <select
              value={selectedJobId}
              onChange={(e) => handleJobSelect(e.target.value)}
              disabled={jobsDisabled}
              className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 mb-2 bg-white ${jobsDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 mb-2"
              />
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleRoleConfirm}
                disabled={!roleValue.trim() || !clientValue.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}
    </div>
  );
}
