"use client";

import { useState } from "react";
import Link from "next/link";
import { changeLeadStatus } from "@/lib/actions/changeLeadStatus";
import { calcTimer, timerColor } from "@/lib/employmentTimer";
import {
  LeadStatus,
  STATUS_LABELS,
  getAllowedTransitions,
  type LeadStatusValue,
} from "@/lib/stateMachine";
import { InterviewScheduleDialog } from "./interview-schedule-dialog";
import { HiredConfirmDialog } from "./hired-confirm-dialog";
import { SubStatusPickerDialog, type SubStatusPickerConfig } from "./sub-status-picker-dialog";
import { SUB_STATUSES, NO_ANSWER_3 } from "@/lib/constants";
import { updateLeadSubStatus } from "./actions";

interface LeadCard {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  status: string;
  sub_status: string | null;
  rejection_reason: string | null;
  hired_client: string | null;
  hired_position: string | null;
  interview_date: string | null;
  interview_notes: string | null;
  followup_notes: string | null;
  screening_score: number | null;
  start_date: string | null;
}

// SCREENING_IN_PROGRESS and FIT_FOR_INTERVIEW are hidden from the board
// while the WhatsApp screening subscription is paused. Restore the two
// commented lines when screening comes back online.
const BOARD_COLUMNS: { value: LeadStatusValue; label: string; headerColor: string }[] = [
  { value: LeadStatus.NEW_LEAD,              label: STATUS_LABELS[LeadStatus.NEW_LEAD],              headerColor: "bg-blue-500" },
  { value: LeadStatus.CONTACTED,             label: STATUS_LABELS[LeadStatus.CONTACTED],             headerColor: "bg-cyan-500" },
  // { value: LeadStatus.SCREENING_IN_PROGRESS, label: STATUS_LABELS[LeadStatus.SCREENING_IN_PROGRESS], headerColor: "bg-orange-500" },
  // { value: LeadStatus.FIT_FOR_INTERVIEW,     label: STATUS_LABELS[LeadStatus.FIT_FOR_INTERVIEW],     headerColor: "bg-amber-500" },
  { value: LeadStatus.INTERVIEW_BOOKED,      label: STATUS_LABELS[LeadStatus.INTERVIEW_BOOKED],      headerColor: "bg-purple-500" },
  { value: LeadStatus.ARRIVED,               label: STATUS_LABELS[LeadStatus.ARRIVED],               headerColor: "bg-indigo-500" },
  { value: LeadStatus.HIRED,                 label: STATUS_LABELS[LeadStatus.HIRED],                 headerColor: "bg-green-500" },
  { value: LeadStatus.STARTED,               label: STATUS_LABELS[LeadStatus.STARTED],               headerColor: "bg-emerald-500" },
  { value: LeadStatus.NO_SHOW,               label: STATUS_LABELS[LeadStatus.NO_SHOW],               headerColor: "bg-red-500" },
  { value: LeadStatus.REJECTED,              label: STATUS_LABELS[LeadStatus.REJECTED],              headerColor: "bg-gray-500" },
  { value: LeadStatus.LOST_CONTACT,          label: STATUS_LABELS[LeadStatus.LOST_CONTACT],          headerColor: "bg-rose-500" },
  { value: LeadStatus.NOT_SUITABLE,          label: STATUS_LABELS[LeadStatus.NOT_SUITABLE],          headerColor: "bg-stone-500" },
];

// Statuses that should not appear in any status picker (board / dropdown / etc).
// Used so existing leads that already sit on these statuses still render with
// the correct label, but no one can transition INTO them from the UI.
const HIDDEN_STATUSES: LeadStatusValue[] = [
  LeadStatus.SCREENING_IN_PROGRESS,
  LeadStatus.FIT_FOR_INTERVIEW,
];

const SOURCE_COLORS: Record<string, string> = {
  "AllJobs": "bg-blue-100 text-blue-700",
  "פייסבוק": "bg-indigo-100 text-indigo-700",
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

export function BoardView({ leads: initialLeads, onSelectLead }: { leads: LeadCard[]; onSelectLead?: (id: string) => void }) {
  const [leads, setLeads] = useState(initialLeads);
  const [dragging, setDragging] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [interviewDialog, setInterviewDialog] = useState<{ open: boolean; leadId: string | null; loading: boolean }>({
    open: false, leadId: null, loading: false,
  });
  const [hiredDialog, setHiredDialog] = useState<{ open: boolean; leadId: string | null; loading: boolean }>({
    open: false, leadId: null, loading: false,
  });
  const [subStatusDialog, setSubStatusDialog] = useState<{
    open: boolean;
    leadId: string | null;
    targetStatus: LeadStatusValue | null;
    loading: boolean;
  }>({ open: false, leadId: null, targetStatus: null, loading: false });

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

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleDragStart(leadId: string) {
    setDragging(leadId);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function handleDrop(columnValue: LeadStatusValue) {
    if (!dragging) return;
    const lead = leads.find((l) => l.id === dragging);
    if (!lead || lead.status === columnValue) {
      setDragging(null);
      return;
    }

    const currentStatus = lead.status as LeadStatusValue;

    // Check if this is an allowed transition before even trying
    const allowed = getAllowedTransitions(currentStatus);
    if (!allowed.includes(columnValue)) {
      setDragging(null);
      showToast(
        `מעבר לא חוקי: ${STATUS_LABELS[currentStatus]} → ${STATUS_LABELS[columnValue]}`,
        "error"
      );
      return;
    }

    // Intercept INTERVIEW_BOOKED — show scheduling dialog, don't move card yet
    if (columnValue === LeadStatus.INTERVIEW_BOOKED) {
      setDragging(null);
      setInterviewDialog({ open: true, leadId: lead.id, loading: false });
      return;
    }

    // Intercept HIRED — show client/date dialog, don't move card yet
    if (columnValue === LeadStatus.HIRED) {
      setDragging(null);
      setHiredDialog({ open: true, leadId: lead.id, loading: false });
      return;
    }

    // Intercept CONTACTED / NOT_SUITABLE — require a sub-status before moving.
    if (columnValue === LeadStatus.CONTACTED || columnValue === LeadStatus.NOT_SUITABLE) {
      setDragging(null);
      setSubStatusDialog({ open: true, leadId: lead.id, targetStatus: columnValue, loading: false });
      return;
    }

    // Optimistically move the card
    setLeads((prev) =>
      prev.map((l) => (l.id === dragging ? { ...l, status: columnValue } : l))
    );
    setDragging(null);

    // Call the state machine server action
    const result = await changeLeadStatus({
      leadId: lead.id,
      newStatus: columnValue,
      userId: "user",
      notes: `גרירה ידנית ל${STATUS_LABELS[columnValue]}`,
    });

    if (!result.success) {
      // Revert on error
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status: lead.status } : l))
      );
      showToast(result.error ?? "שגיאה בעדכון הסטטוס", "error");
    } else {
      showToast("הסטטוס עודכן");
    }
  }

  async function handleInterviewConfirm(data: { interviewDate: string; interviewType: "in_person" | "video"; designatedRole: string }) {
    const leadId = interviewDialog.leadId;
    if (!leadId) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    setInterviewDialog((prev) => ({ ...prev, loading: true }));

    // Optimistically move the card
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: LeadStatus.INTERVIEW_BOOKED, interview_date: data.interviewDate, hired_position: data.designatedRole || l.hired_position } : l))
    );

    const result = await changeLeadStatus({
      leadId,
      newStatus: LeadStatus.INTERVIEW_BOOKED,
      userId: "user",
      notes: "קביעת ראיון מלוח הקנבן",
      extra: {
        interviewDate: data.interviewDate,
        interviewType: data.interviewType,
        hiredPosition: data.designatedRole || undefined,
      },
    });

    setInterviewDialog({ open: false, leadId: null, loading: false });

    if (!result.success) {
      // Revert on error
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: lead.status } : l))
      );
      showToast(result.error ?? "שגיאה בעדכון הסטטוס", "error");
    } else {
      showToast("ראיון נקבע בהצלחה");
    }
  }

  async function handleHiredConfirm(data: { hiredJobId: string; startDate: string }) {
    const leadId = hiredDialog.leadId;
    if (!leadId) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    setHiredDialog((prev) => ({ ...prev, loading: true }));

    // Optimistically move the card; client/position will be filled by the server
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId ? { ...l, status: LeadStatus.HIRED, start_date: data.startDate } : l
      )
    );

    const result = await changeLeadStatus({
      leadId,
      newStatus: LeadStatus.HIRED,
      userId: "user",
      notes: "קבלה מלוח הקנבן",
      extra: {
        hiredJobId: data.hiredJobId,
        startDate: data.startDate,
      },
    });

    setHiredDialog({ open: false, leadId: null, loading: false });

    if (!result.success) {
      // Revert on error
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: lead.status } : l))
      );
      showToast(result.error ?? "שגיאה בעדכון הסטטוס", "error");
    } else {
      showToast("התקבל בהצלחה");
    }
  }

  async function handleSubStatusConfirm(subStatus: string) {
    const { leadId, targetStatus } = subStatusDialog;
    if (!leadId || !targetStatus) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    setSubStatusDialog((prev) => ({ ...prev, loading: true }));

    // Optimistic
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: targetStatus, sub_status: subStatus } : l))
    );

    const statusRes = await changeLeadStatus({
      leadId,
      newStatus: targetStatus,
      userId: "user",
      notes: `${STATUS_LABELS[targetStatus]}: ${subStatus}`,
    });
    if (!statusRes.success) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: lead.status, sub_status: lead.sub_status } : l)));
      setSubStatusDialog({ open: false, leadId: null, targetStatus: null, loading: false });
      showToast(statusRes.error ?? "שגיאה בעדכון הסטטוס", "error");
      return;
    }

    // changeLeadStatus clears sub_status server-side — write it again.
    const subRes = await updateLeadSubStatus(leadId, subStatus);
    if (subRes.error) {
      showToast(`שגיאה בשמירת תת-סטטוס: ${subRes.error}`, "error");
    }

    // Auto-jump to LOST_CONTACT only for CONTACTED + "אין מענה 3"
    if (targetStatus === LeadStatus.CONTACTED && subStatus === NO_ANSWER_3) {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: LeadStatus.LOST_CONTACT, sub_status: null } : l))
      );
      const lostRes = await changeLeadStatus({
        leadId,
        newStatus: LeadStatus.LOST_CONTACT,
        userId: "user",
        notes: "אבד קשר אחרי 3 ניסיונות",
      });
      setSubStatusDialog({ open: false, leadId: null, targetStatus: null, loading: false });
      if (!lostRes.success) {
        showToast(lostRes.error ?? "שגיאה במעבר ל“אבד קשר”", "error");
      } else {
        showToast("הליד הועבר ל“אבד קשר”");
      }
      return;
    }

    setSubStatusDialog({ open: false, leadId: null, targetStatus: null, loading: false });
    showToast(`${STATUS_LABELS[targetStatus]} — ${subStatus}`);
  }

  async function handleSubStatusChange(leadId: string, value: string) {
    const newSub = value || null;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, sub_status: newSub } : l)));

    const res = await updateLeadSubStatus(leadId, newSub);
    if (res.error) {
      // Revert
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, sub_status: lead.sub_status } : l)));
      showToast(`שגיאה: ${res.error}`, "error");
      return;
    }

    // Auto-transition: "אין מענה 3" → LOST_CONTACT
    if (newSub === NO_ANSWER_3 && lead.status !== LeadStatus.LOST_CONTACT) {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: LeadStatus.LOST_CONTACT, sub_status: null } : l))
      );
      const transition = await changeLeadStatus({
        leadId,
        newStatus: LeadStatus.LOST_CONTACT,
        userId: "user",
        notes: "אבד קשר אחרי 3 ניסיונות",
      });
      if (!transition.success) {
        // Revert both
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status: lead.status, sub_status: lead.sub_status } : l))
        );
        showToast(transition.error ?? "שגיאה בעדכון הסטטוס", "error");
      } else {
        showToast("הליד הועבר ל“אבד קשר”");
      }
    }
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((col) => {
          const columnLeads = leads.filter((l) => l.status === col.value);
          return (
            <div
              key={col.value}
              className="flex-shrink-0 w-64 bg-gray-50/80 rounded-xl border border-gray-200/60 flex flex-col"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(col.value)}
            >
              <div className={`${col.headerColor} rounded-t-xl px-3 py-2 flex items-center justify-between`}>
                <span className="text-white font-semibold text-xs">{col.label}</span>
                <span className="bg-white/25 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {columnLeads.length}
                </span>
              </div>
              <div className="p-2 flex flex-col gap-2 flex-1 min-h-[150px]">
                {columnLeads.length === 0 ? (
                  <p className="text-[10px] text-gray-400 text-center mt-6">אין לידים</p>
                ) : (
                  columnLeads.map((lead) => {
                    const srcColor = SOURCE_COLORS[lead.source] ?? "bg-gray-100 text-gray-600";
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={() => handleDragStart(lead.id)}
                        className={`bg-white rounded-xl border border-gray-200/80 p-3 shadow-sm hover:shadow-md transition-all duration-200 cursor-grab active:cursor-grabbing active:scale-[0.98] ${dragging === lead.id ? "opacity-40 scale-95" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectLead?.(lead.id)}
                          className="flex items-center gap-2 mb-1.5 hover:opacity-80 text-right w-full"
                        >
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[9px] font-bold">
                            {getInitials(lead.name)}
                          </span>
                          <span className="text-[13px] font-semibold text-gray-900 truncate">
                            {lead.name}
                          </span>
                        </button>
                        {lead.status === "SCREENING_IN_PROGRESS" && (
                          <div className="flex items-center gap-1 mb-1 px-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                            <span className="text-[10px] font-medium text-orange-600">סינון AI פעיל</span>
                          </div>
                        )}
                        {SUB_STATUSES[lead.status] && (
                          <select
                            value={lead.sub_status ?? ""}
                            onChange={(e) => handleSubStatusChange(lead.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            draggable={false}
                            onDragStart={(e) => e.stopPropagation()}
                            className="mb-1.5 w-full text-[10px] border border-gray-200 rounded-md px-1.5 py-0.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-400"
                          >
                            <option value="">— תת-סטטוס —</option>
                            {SUB_STATUSES[lead.status].map((sub) => (
                              <option key={sub} value={sub}>{sub}</option>
                            ))}
                          </select>
                        )}
                        <div className="flex items-center justify-between">
                          {lead.phone ? (
                            <span className="text-[10px] text-gray-500" dir="ltr">{lead.phone}</span>
                          ) : (
                            <span className="text-[10px] text-gray-300">—</span>
                          )}
                          <div className="flex items-center gap-1">
                            <Link
                              href={`/leads/${lead.id}`}
                              className="p-0.5 rounded text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                              title="פרופיל מלא"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                <path d="M15 3h6v6" />
                                <path d="M9 21H3v-6" />
                                <path d="m21 3-7 7" />
                                <path d="m3 21 7-7" />
                              </svg>
                            </Link>
                            <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-medium ${srcColor}`}>
                              {lead.source}
                            </span>
                          </div>
                        </div>
                        {lead.rejection_reason && (
                          <span className="mt-1 inline-block px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-red-50 text-red-600 border border-red-200">
                            {lead.rejection_reason}
                          </span>
                        )}
                        {lead.hired_client && lead.hired_position && (
                          <p className="mt-1 text-[9px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-1.5 py-0.5">
                            <span className="font-medium">מעסיק:</span> {lead.hired_client} | <span className="font-medium">משרה:</span> {lead.hired_position}
                          </p>
                        )}
                        {lead.screening_score != null && (
                          <p className="mt-1 text-[9px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-1.5 py-0.5">
                            <span className="font-medium">ציון סינון:</span> {lead.screening_score}
                          </p>
                        )}
                        {lead.followup_notes && (
                          <div className="mt-1 flex items-start gap-1 text-[9px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-1.5 py-0.5" title={lead.followup_notes}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5 flex-shrink-0 mt-px">
                              <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
                              <path d="M15 3v4a2 2 0 0 0 2 2h4" />
                            </svg>
                            <span className="line-clamp-2">{lead.followup_notes}</span>
                          </div>
                        )}
                        {lead.interview_date && (
                          <p className="mt-1 text-[9px] text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-1.5 py-0.5">
                            <span className="font-medium">ראיון:</span>{" "}
                            {new Date(lead.interview_date).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })}{" "}
                            בשעה {new Date(lead.interview_date).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                            {lead.hired_position && (
                              <> | <span className="font-medium">תפקיד:</span> {lead.hired_position}</>
                            )}
                          </p>
                        )}
                        {lead.start_date && (() => {
                          const timer = calcTimer(lead.start_date);
                          if (!timer) return null;
                          const color = timerColor(timer);
                          const badgeBg = color === "green" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : color === "amber" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-red-50 border-red-200 text-red-700";
                          return (
                            <p className={`mt-1 text-[9px] ${badgeBg} border rounded-lg px-1.5 py-0.5`}>
                              {timer.expired
                                ? "⚠ תקופת העסקה הסתיימה"
                                : `⏳ נותרו ${timer.remainingDays} ימים`}
                            </p>
                          );
                        })()}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 text-white text-sm rounded-lg shadow-lg ${
          toast.type === "error" ? "bg-red-600" : "bg-gray-900"
        }`}>
          {toast.message}
        </div>
      )}

      <InterviewScheduleDialog
        open={interviewDialog.open}
        onConfirm={handleInterviewConfirm}
        onCancel={() => setInterviewDialog({ open: false, leadId: null, loading: false })}
        loading={interviewDialog.loading}
      />

      <HiredConfirmDialog
        open={hiredDialog.open}
        onConfirm={handleHiredConfirm}
        onCancel={() => setHiredDialog({ open: false, leadId: null, loading: false })}
        loading={hiredDialog.loading}
      />

      <SubStatusPickerDialog
        open={subStatusDialog.open}
        config={subStatusDialog.targetStatus ? SUB_STATUS_DIALOG_CONFIG[subStatusDialog.targetStatus] ?? null : null}
        onConfirm={handleSubStatusConfirm}
        onCancel={() => setSubStatusDialog({ open: false, leadId: null, targetStatus: null, loading: false })}
        loading={subStatusDialog.loading}
      />
    </>
  );
}
