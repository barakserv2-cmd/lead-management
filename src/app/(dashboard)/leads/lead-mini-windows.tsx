"use client";

import { useState } from "react";
import type { Lead } from "@/types/leads";
import { StatusSelect } from "./status-select";
import { ChatHistory } from "./[id]/chat-history";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/stateMachine";
import type { LeadStatusValue } from "@/lib/stateMachine";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.slice(0, 2);
}

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "972");
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M5 12h14" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function WhatsAppSmallIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function PhoneSmallIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

interface MiniWindowState {
  lead: Lead;
  minimized: boolean;
}

function LeadMiniWindow({
  lead,
  minimized,
  onClose,
  onToggleMinimize,
}: {
  lead: Lead;
  minimized: boolean;
  onClose: () => void;
  onToggleMinimize: () => void;
}) {
  const statusColor = STATUS_COLORS[lead.status as LeadStatusValue];
  const statusLabel = STATUS_LABELS[lead.status as LeadStatusValue] ?? lead.status;
  const intlPhone = formatPhone(lead.phone);

  return (
    <div
      className={`flex flex-col bg-white rounded-t-xl shadow-2xl border border-gray-200 overflow-hidden transition-all duration-200 ${
        minimized ? "w-[240px]" : "w-[360px] h-[480px]"
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gradient-to-l from-cyan-600 to-cyan-700 text-white cursor-pointer select-none flex-shrink-0"
        onClick={onToggleMinimize}
      >
        <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
          {getInitials(lead.name)}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">{lead.name}</p>
          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${statusColor?.bg ?? "bg-gray-100"} ${statusColor?.text ?? "text-gray-800"}`}>
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {intlPhone && (
            <>
              <a
                href={"https://api.whatsapp.com/send?phone=" + intlPhone}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded hover:bg-white/20 transition-colors"
                title="WhatsApp"
                onClick={(e) => e.stopPropagation()}
              >
                <WhatsAppSmallIcon />
              </a>
              <a
                href={"tel:" + lead.phone}
                className="p-1 rounded hover:bg-white/20 transition-colors"
                title="התקשר"
                onClick={(e) => e.stopPropagation()}
              >
                <PhoneSmallIcon />
              </a>
            </>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleMinimize(); }}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            title={minimized ? "הרחב" : "מזער"}
          >
            {minimized ? <MaximizeIcon /> : <MinimizeIcon />}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            title="סגור"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Body — only shown when not minimized */}
      {!minimized && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Status bar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
            <span className="text-[10px] text-gray-500 flex-shrink-0">סטטוס:</span>
            <StatusSelect leadId={lead.id} currentStatus={lead.status} currentSubStatus={lead.sub_status} />
          </div>

          {/* Chat */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatHistory leadId={lead.id} leadStatus={lead.status as LeadStatusValue} />
          </div>
        </div>
      )}
    </div>
  );
}

const MAX_WINDOWS = 4;

export function LeadWindowManager({
  leads,
  openLeadIds,
  onOpenLead,
  onCloseLead,
}: {
  leads: Lead[];
  openLeadIds: string[];
  onOpenLead: (id: string) => void;
  onCloseLead: (id: string) => void;
}) {
  const [minimizedIds, setMinimizedIds] = useState<Set<string>>(new Set());

  function toggleMinimize(id: string) {
    setMinimizedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleClose(id: string) {
    setMinimizedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onCloseLead(id);
  }

  // Get Lead objects for open windows (keep insertion order, limit to MAX_WINDOWS)
  const openWindows: Lead[] = [];
  for (const id of openLeadIds) {
    if (openWindows.length >= MAX_WINDOWS) break;
    const lead = leads.find((l) => l.id === id);
    if (lead) openWindows.push(lead);
  }

  if (openWindows.length === 0) return null;

  return (
    <div className="fixed bottom-0 right-4 z-50 flex flex-row-reverse items-end gap-2 pointer-events-none">
      {openWindows.map((lead) => (
        <div key={lead.id} className="pointer-events-auto">
          <LeadMiniWindow
            lead={lead}
            minimized={minimizedIds.has(lead.id)}
            onClose={() => handleClose(lead.id)}
            onToggleMinimize={() => toggleMinimize(lead.id)}
          />
        </div>
      ))}
    </div>
  );
}
