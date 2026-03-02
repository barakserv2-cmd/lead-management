"use client";

import { useState, useRef, useEffect } from "react";
import { changeLeadStatus } from "@/lib/actions/changeLeadStatus";
import { updateLeadSubStatus } from "./actions";
import {
  LeadStatus,
  STATUS_LABELS,
  STATUS_COLORS,
  ALL_STATUSES,
  getAllowedTransitions,
  type LeadStatusValue,
} from "@/lib/stateMachine";
import { SUB_STATUSES } from "@/lib/constants";

const QUICK_STATUSES = ALL_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
  color: `${STATUS_COLORS[value].bg} ${STATUS_COLORS[value].text}`,
  dot: STATUS_COLORS[value].dot,
}));

function getStatusStyle(status: string) {
  return QUICK_STATUSES.find((s) => s.value === status) ?? {
    value: status,
    label: status,
    color: "bg-gray-100 text-gray-800",
    dot: "bg-gray-500",
  };
}

export function StatusSelect({ leadId, currentStatus, currentSubStatus }: { leadId: string; currentStatus: string; currentSubStatus?: string | null }) {
  const [status, setStatus] = useState(currentStatus);
  const [subStatus, setSubStatus] = useState<string | null>(currentSubStatus ?? null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const current = getStatusStyle(status);

  // Only show allowed transitions from the current status
  const allowedTargets = getAllowedTransitions(status as LeadStatusValue);
  const availableStatuses = QUICK_STATUSES.filter(
    (s) => s.value === status || allowedTargets.includes(s.value)
  );

  async function handleSelect(newStatus: string) {
    if (newStatus === status) {
      setOpen(false);
      return;
    }

    setOpen(false);
    setLoading(true);

    const result = await changeLeadStatus({
      leadId,
      newStatus: newStatus as LeadStatusValue,
      userId: "user",
      notes: "שינוי ידני מהטבלה",
    });

    setLoading(false);

    if (!result.success) {
      setToast({ message: result.error ?? "שגיאה בעדכון", type: "error" });
    } else {
      setStatus(newStatus);
      setSubStatus(null);
      setToast({ message: "הסטטוס עודכן", type: "success" });
    }
  }

  async function handleSubStatusChange(value: string) {
    const newSub = value || null;
    setSubStatus(newSub);
    const result = await updateLeadSubStatus(leadId, newSub);
    if (result.error) {
      setToast({ message: `שגיאה: ${result.error}`, type: "error" });
    }
  }

  return (
    <>
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
          <div className="absolute z-50 mt-1 right-0 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in max-h-72 overflow-y-auto">
            {availableStatuses.map((s) => {
              const isActive = s.value === status;
              const isAllowed = allowedTargets.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => handleSelect(s.value)}
                  disabled={isActive}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-right hover:bg-gray-50 transition-colors ${isActive ? "bg-gray-50 font-semibold" : ""} ${!isActive && !isAllowed ? "opacity-40 cursor-not-allowed" : ""}`}
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

        {/* Sub-status dropdown */}
        {SUB_STATUSES[status] && (
          <select
            value={subStatus ?? ""}
            onChange={(e) => handleSubStatusChange(e.target.value)}
            className="mt-1 w-full text-[10px] border border-gray-200 rounded-md px-1.5 py-0.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
          >
            <option value="">— תת-סטטוס —</option>
            {SUB_STATUSES[status].map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
        )}

        {toast && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 text-white text-sm rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-4 ${
            toast.type === "error" ? "bg-red-600" : "bg-gray-900"
          }`}>
            {toast.message}
          </div>
        )}
      </div>
    </>
  );
}
