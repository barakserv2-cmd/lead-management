"use client";

import { useState, useRef, useEffect } from "react";
import { changeLeadStatus } from "@/lib/changeLeadStatusClient";
import { updateLeadSubStatus } from "./actions";
import {
  LeadStatus,
  STATUS_LABELS,
  STATUS_COLORS,
  ALL_STATUSES,
  getAllowedTransitions,
  type LeadStatusValue,
} from "@/lib/stateMachine";
import { SUB_STATUSES, NO_ANSWER_3 } from "@/lib/constants";

const SUB_STATUS_DIALOG_CONFIG: Partial<Record<LeadStatusValue, SubStatusPickerConfig>> = {
  [LeadStatus.CONTACTED]: {
    title: "נוצר קשר — מצב",
    subtitle: "בחר את תוצאת הניסיון",
    options: SUB_STATUSES.CONTACTED ?? [],
    accent: "cyan",
    hint: { option: NO_ANSWER_3, text: "→ אבד קשר אוטומטית" },
  },
  [LeadStatus.NOT_SUITABLE]: {
    title: "לא מתאים — סיבה",
    subtitle: "בחר את הסיבה לפסילה",
    options: SUB_STATUSES.NOT_SUITABLE ?? [],
    accent: "stone",
  },
};
import { InterviewScheduleDialog } from "./interview-schedule-dialog";
import { HiredConfirmDialog } from "./hired-confirm-dialog";
import { SubStatusPickerDialog, type SubStatusPickerConfig } from "./sub-status-picker-dialog";

const QUICK_STATUSES = ALL_STATUSES
  .map((value) => ({
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
  const [showInterviewDialog, setShowInterviewDialog] = useState(false);
  const [showHiredDialog, setShowHiredDialog] = useState(false);
  const [subStatusDialog, setSubStatusDialog] = useState<{ open: boolean; targetStatus: LeadStatusValue | null }>({ open: false, targetStatus: null });

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

    // Intercept INTERVIEW_BOOKED — open scheduling dialog instead
    if (newStatus === LeadStatus.INTERVIEW_BOOKED) {
      setShowInterviewDialog(true);
      return;
    }

    // Intercept HIRED — open client/date dialog instead
    if (newStatus === LeadStatus.HIRED) {
      setShowHiredDialog(true);
      return;
    }

    // Intercept CONTACTED / NOT_SUITABLE — require a sub-status
    if (newStatus === LeadStatus.CONTACTED || newStatus === LeadStatus.NOT_SUITABLE) {
      setSubStatusDialog({ open: true, targetStatus: newStatus as LeadStatusValue });
      return;
    }

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

  async function handleInterviewConfirm(data: { interviewDate: string; interviewType: "in_person" | "video"; designatedRole: string }) {
    setLoading(true);

    const result = await changeLeadStatus({
      leadId,
      newStatus: LeadStatus.INTERVIEW_BOOKED,
      userId: "user",
      notes: "קביעת ראיון ידנית",
      extra: {
        interviewDate: data.interviewDate,
        interviewType: data.interviewType,
        hiredPosition: data.designatedRole || undefined,
      },
    });

    setLoading(false);
    setShowInterviewDialog(false);

    if (!result.success) {
      setToast({ message: result.error ?? "שגיאה בעדכון", type: "error" });
    } else {
      setStatus(LeadStatus.INTERVIEW_BOOKED);
      setSubStatus(null);
      setToast({ message: "ראיון נקבע בהצלחה", type: "success" });
    }
  }

  async function handleHiredConfirm(data: { hiredJobId: string; startDate: string }) {
    setLoading(true);

    const result = await changeLeadStatus({
      leadId,
      newStatus: LeadStatus.HIRED,
      userId: "user",
      notes: "קבלה ידנית",
      extra: {
        hiredJobId: data.hiredJobId,
        startDate: data.startDate,
      },
    });

    setLoading(false);
    setShowHiredDialog(false);

    if (!result.success) {
      setToast({ message: result.error ?? "שגיאה בעדכון", type: "error" });
    } else {
      setStatus(LeadStatus.HIRED);
      setSubStatus(null);
      setToast({ message: "התקבל בהצלחה", type: "success" });
    }
  }

  async function handleSubStatusConfirm(chosenSub: string) {
    const target = subStatusDialog.targetStatus;
    if (!target) return;
    setLoading(true);

    const statusRes = await changeLeadStatus({
      leadId,
      newStatus: target,
      userId: "user",
      notes: `${STATUS_LABELS[target]}: ${chosenSub}`,
    });
    if (!statusRes.success) {
      setLoading(false);
      setSubStatusDialog({ open: false, targetStatus: null });
      setToast({ message: statusRes.error ?? "שגיאה בעדכון", type: "error" });
      return;
    }
    setStatus(target);

    await updateLeadSubStatus(leadId, chosenSub);
    setSubStatus(chosenSub);

    // Auto-transition for CONTACTED + "אין מענה 3"
    if (target === LeadStatus.CONTACTED && chosenSub === NO_ANSWER_3) {
      const lostRes = await changeLeadStatus({
        leadId,
        newStatus: LeadStatus.LOST_CONTACT,
        userId: "user",
        notes: "אבד קשר אחרי 3 ניסיונות",
      });
      setLoading(false);
      setSubStatusDialog({ open: false, targetStatus: null });
      if (!lostRes.success) {
        setToast({ message: lostRes.error ?? "שגיאה במעבר ל“אבד קשר”", type: "error" });
        return;
      }
      setStatus(LeadStatus.LOST_CONTACT);
      setSubStatus(null);
      setToast({ message: "הליד הועבר ל“אבד קשר”", type: "success" });
      return;
    }

    setLoading(false);
    setSubStatusDialog({ open: false, targetStatus: null });
    setToast({ message: `${STATUS_LABELS[target]} — ${chosenSub}`, type: "success" });
  }

  async function handleSubStatusChange(value: string) {
    const newSub = value || null;
    setSubStatus(newSub);
    const result = await updateLeadSubStatus(leadId, newSub);
    if (result.error) {
      setToast({ message: `שגיאה: ${result.error}`, type: "error" });
      return;
    }

    // Auto-transition: "אין מענה 3" pushes the lead to LOST_CONTACT.
    if (newSub === NO_ANSWER_3 && status !== LeadStatus.LOST_CONTACT) {
      setLoading(true);
      const transition = await changeLeadStatus({
        leadId,
        newStatus: LeadStatus.LOST_CONTACT,
        userId: "user",
        notes: "אבד קשר אחרי 3 ניסיונות",
      });
      setLoading(false);
      if (!transition.success) {
        setToast({ message: transition.error ?? "שגיאה בעדכון הסטטוס", type: "error" });
        return;
      }
      setStatus(LeadStatus.LOST_CONTACT);
      // changeLeadStatus clears sub_status server-side; mirror it client-side.
      setSubStatus(null);
      setToast({ message: "הליד הועבר ל“אבד קשר”", type: "success" });
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
                    <svg className="w-3 h-3 mr-auto text-cyan-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
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

      <InterviewScheduleDialog
        open={showInterviewDialog}
        onConfirm={handleInterviewConfirm}
        onCancel={() => setShowInterviewDialog(false)}
        loading={loading}
      />

      <HiredConfirmDialog
        open={showHiredDialog}
        onConfirm={handleHiredConfirm}
        onCancel={() => setShowHiredDialog(false)}
        loading={loading}
      />

      <SubStatusPickerDialog
        open={subStatusDialog.open}
        config={subStatusDialog.targetStatus ? SUB_STATUS_DIALOG_CONFIG[subStatusDialog.targetStatus] ?? null : null}
        onConfirm={handleSubStatusConfirm}
        onCancel={() => setSubStatusDialog({ open: false, targetStatus: null })}
        loading={loading}
      />
    </>
  );
}
