"use client";

import { useState } from "react";
import { updateLeadStatus } from "./actions";
import { LEAD_STATUSES } from "@/lib/constants";
import { RejectionReasonDialog } from "./rejection-reason-dialog";

const NOT_RELEVANT = LEAD_STATUSES.NOT_RELEVANT;

interface LeadCard {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  status: string;
  rejection_reason: string | null;
}

const BOARD_COLUMNS = [
  { value: "חדש", label: "חדש", headerColor: "bg-blue-500" },
  { value: "מעקב", label: "מעקב", headerColor: "bg-orange-500" },
  { value: "ראיון במשרד", label: "ראיון במשרד", headerColor: "bg-purple-500" },
  { value: "לא רלוונטי", label: "לא רלוונטי", headerColor: "bg-gray-500" },
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

export function BoardView({ leads: initialLeads, onSelectLead }: { leads: LeadCard[]; onSelectLead?: (id: string) => void }) {
  const [leads, setLeads] = useState(initialLeads);
  const [dragging, setDragging] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{ leadId: string; previousStatus: string } | null>(null);
  const [rejectionLoading, setRejectionLoading] = useState(false);

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

    // Optimistically move
    setLeads((prev) =>
      prev.map((l) => (l.id === dragging ? { ...l, status: columnValue, rejection_reason: null } : l))
    );

    if (columnValue === NOT_RELEVANT) {
      setPendingDrop({ leadId: dragging, previousStatus: lead.status });
      setDragging(null);
      setRejectionDialogOpen(true);
      return;
    }

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

  async function handleRejectionConfirm(reason: string) {
    if (!pendingDrop) return;
    setRejectionLoading(true);
    const result = await updateLeadStatus(pendingDrop.leadId, NOT_RELEVANT, reason);
    setRejectionLoading(false);
    setRejectionDialogOpen(false);

    if (result.error) {
      setLeads((prev) =>
        prev.map((l) => (l.id === pendingDrop.leadId ? { ...l, status: pendingDrop.previousStatus } : l))
      );
      setToast(`שגיאה: ${result.error}`);
    } else {
      setLeads((prev) =>
        prev.map((l) => (l.id === pendingDrop.leadId ? { ...l, rejection_reason: reason } : l))
      );
      setToast("הסטטוס עודכן");
    }
    setPendingDrop(null);
    setTimeout(() => setToast(null), 2500);
  }

  function handleRejectionCancel() {
    if (pendingDrop) {
      setLeads((prev) =>
        prev.map((l) => (l.id === pendingDrop.leadId ? { ...l, status: pendingDrop.previousStatus } : l))
      );
    }
    setPendingDrop(null);
    setRejectionDialogOpen(false);
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
                        {lead.rejection_reason && (
                          <span className="mt-1.5 inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-200">
                            {lead.rejection_reason}
                          </span>
                        )}
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <RejectionReasonDialog
        open={rejectionDialogOpen}
        onOpenChange={(open) => { if (!open) handleRejectionCancel(); }}
        onConfirm={handleRejectionConfirm}
        loading={rejectionLoading}
      />
    </>
  );
}
