"use client";

import { useState, useRef, useEffect } from "react";
import { updateLeadStatus, updateLeadSubStatus } from "./actions";
import { LEAD_STATUSES, SUB_STATUSES } from "@/lib/constants";
import { RejectionReasonDialog } from "./rejection-reason-dialog";
import { HiredDetailsDialog } from "./hired-details-dialog";
import { InterviewDialog } from "./interview-dialog";
import { FollowupDialog } from "./followup-dialog";

const NOT_RELEVANT = LEAD_STATUSES.NOT_RELEVANT;
const ACCEPTED = LEAD_STATUSES.ACCEPTED;
const INTERVIEW = LEAD_STATUSES.INTERVIEW;
const FOLLOWUP = LEAD_STATUSES.FOLLOWUP;

const QUICK_STATUSES = [
  { value: LEAD_STATUSES.NEW, label: "חדש", color: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  { value: LEAD_STATUSES.FOLLOWUP, label: "מעקב", color: "bg-orange-100 text-orange-800", dot: "bg-orange-500" },
  { value: LEAD_STATUSES.INTERVIEW, label: "ראיון במשרד", color: "bg-purple-100 text-purple-800", dot: "bg-purple-500" },
  { value: LEAD_STATUSES.ACCEPTED, label: "התקבל", color: "bg-green-100 text-green-800", dot: "bg-green-500" },
  { value: LEAD_STATUSES.NOT_RELEVANT, label: "לא רלוונטי", color: "bg-gray-200 text-gray-700", dot: "bg-gray-500" },
];

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
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [hiredDialogOpen, setHiredDialogOpen] = useState(false);
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [followupDialogOpen, setFollowupDialogOpen] = useState(false);

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
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const current = getStatusStyle(status);

  async function handleSelect(newStatus: string) {
    if (newStatus === status) {
      setOpen(false);
      return;
    }

    setOpen(false);

    if (newStatus === NOT_RELEVANT) {
      setRejectionDialogOpen(true);
      return;
    }

    if (newStatus === ACCEPTED) {
      setHiredDialogOpen(true);
      return;
    }

    if (newStatus === INTERVIEW) {
      setInterviewDialogOpen(true);
      return;
    }

    if (newStatus === FOLLOWUP) {
      setFollowupDialogOpen(true);
      return;
    }

    setLoading(true);
    const result = await updateLeadStatus(leadId, newStatus);
    setLoading(false);

    if (result.error) {
      setToast(`שגיאה: ${result.error}`);
    } else {
      setStatus(newStatus);
      setSubStatus(null);
      setToast("הסטטוס עודכן");
    }
  }

  async function handleRejectionConfirm(reason: string) {
    setLoading(true);
    const result = await updateLeadStatus(leadId, NOT_RELEVANT, { rejectionReason: reason });
    setLoading(false);
    setRejectionDialogOpen(false);

    if (result.error) {
      setToast(`שגיאה: ${result.error}`);
    } else {
      setStatus(NOT_RELEVANT);
      setSubStatus(null);
      setToast("הסטטוס עודכן");
    }
  }

  async function handleHiredConfirm(client: string, position: string) {
    setLoading(true);
    const result = await updateLeadStatus(leadId, ACCEPTED, { hiredClient: client, hiredPosition: position });
    setLoading(false);
    setHiredDialogOpen(false);

    if (result.error) {
      setToast(`שגיאה: ${result.error}`);
    } else {
      setStatus(ACCEPTED);
      setSubStatus(null);
      setToast("הסטטוס עודכן");
    }
  }

  async function handleInterviewConfirm(date: string, notes: string) {
    setLoading(true);
    const result = await updateLeadStatus(leadId, INTERVIEW, { interviewDate: date, interviewNotes: notes });
    setLoading(false);
    setInterviewDialogOpen(false);

    if (result.error) {
      setToast(`שגיאה: ${result.error}`);
    } else {
      setStatus(INTERVIEW);
      setSubStatus(null);
      setToast("הסטטוס עודכן");
    }
  }

  async function handleFollowupConfirm(notes: string) {
    setLoading(true);
    const result = await updateLeadStatus(leadId, FOLLOWUP, { followupNotes: notes });
    setLoading(false);
    setFollowupDialogOpen(false);

    if (result.error) {
      setToast(`שגיאה: ${result.error}`);
    } else {
      setStatus(FOLLOWUP);
      setSubStatus(null);
      setToast("הסטטוס עודכן");
    }
  }

  async function handleSubStatusChange(value: string) {
    const newSub = value || null;
    setSubStatus(newSub);
    const result = await updateLeadSubStatus(leadId, newSub);
    if (result.error) {
      setToast(`שגיאה: ${result.error}`);
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
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-4">
            {toast}
          </div>
        )}
      </div>

      <RejectionReasonDialog
        open={rejectionDialogOpen}
        onOpenChange={setRejectionDialogOpen}
        onConfirm={handleRejectionConfirm}
        loading={loading}
      />

      <HiredDetailsDialog
        open={hiredDialogOpen}
        onOpenChange={setHiredDialogOpen}
        onConfirm={handleHiredConfirm}
        loading={loading}
      />

      <InterviewDialog
        open={interviewDialogOpen}
        onOpenChange={setInterviewDialogOpen}
        onConfirm={handleInterviewConfirm}
        loading={loading}
      />

      <FollowupDialog
        open={followupDialogOpen}
        onOpenChange={setFollowupDialogOpen}
        onConfirm={handleFollowupConfirm}
        loading={loading}
      />
    </>
  );
}
