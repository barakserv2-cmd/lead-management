"use client";

import { useState, useEffect, useCallback } from "react";
import type { Lead } from "@/types/leads";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/stateMachine";
import type { LeadStatusValue } from "@/lib/stateMachine";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusSelect } from "./status-select";

// ── AI Summary Hook ──────────────────────────────────────────

function useAISummary(lead: Lead | null, open: boolean) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (leadData: Lead) => {
    setLoading(true);
    setError(null);
    setSummary("");
    try {
      const res = await fetch("/api/ai/lead-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: leadData }),
      });
      if (!res.ok) throw new Error("Failed to fetch summary");
      const data = await res.json();
      setSummary(data.summary);
    } catch {
      setError("לא ניתן לייצר סיכום כרגע");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && lead) {
      fetchSummary(lead);
    }
    if (!open) {
      setSummary("");
      setError(null);
    }
  }, [open, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return { summary, loading, error, retry: () => lead && fetchSummary(lead) };
}

// ── Detail Row ───────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm font-medium text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-left" dir="auto">
        {value || "—"}
      </span>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────

interface LeadCardPanelProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadCardPanel({ lead, open, onOpenChange }: LeadCardPanelProps) {
  const { summary, loading, error, retry } = useAISummary(lead, open);

  if (!lead) return null;

  const statusColor = STATUS_COLORS[lead.status as LeadStatusValue] ?? {
    bg: "bg-gray-100",
    text: "text-gray-700",
    dot: "bg-gray-500",
  };
  const statusLabel = STATUS_LABELS[lead.status as LeadStatusValue] ?? lead.status;

  const initials = (() => {
    const parts = lead.name.trim().split(/\s+/);
    if (parts.length >= 2) return parts[0][0] + parts[1][0];
    return lead.name.slice(0, 2);
  })();

  const formatDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-lg overflow-y-auto p-0"
        showCloseButton={false}
      >
        {/* Header */}
        <SheetHeader className="bg-gradient-to-bl from-cyan-50 to-white p-6 border-b">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-cyan-600 text-white flex items-center justify-center text-lg font-bold shrink-0">
                {initials}
              </div>
              <div>
                <SheetTitle className="text-xl">{lead.name}</SheetTitle>
                <SheetDescription className="text-sm text-gray-500">
                  {lead.job_title ?? "ללא תפקיד"} {lead.location ? `· ${lead.location}` : ""}
                </SheetDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <line x1="18" x2="6" y1="6" y2="18" />
                <line x1="6" x2="18" y1="6" y2="18" />
              </svg>
            </button>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2 mt-3">
            <Badge className={`${statusColor.bg} ${statusColor.text} border-0`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusColor.dot} mr-1`} />
              {statusLabel}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {lead.source}
            </Badge>
          </div>
        </SheetHeader>

        {/* AI Summary */}
        <div className="mx-6 mt-5 mb-4 p-4 rounded-xl bg-gradient-to-bl from-violet-50 to-blue-50 border border-violet-200/60">
          <div className="flex items-center gap-2 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-violet-600">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            <span className="text-sm font-semibold text-violet-800">סיכום AI</span>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-violet-600">
              <span className="inline-block w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
              מייצר סיכום...
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 flex items-center gap-2">
              {error}
              <button type="button" onClick={retry} className="underline hover:no-underline text-violet-600">
                נסה שוב
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-800 leading-relaxed">{summary}</p>
          )}
        </div>

        {/* Lead Details */}
        <div className="px-6 pb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">פרטי ליד</h3>
          <div className="bg-white rounded-lg border p-3">
            <DetailRow label="טלפון" value={lead.phone} />
            <DetailRow label="אימייל" value={lead.email} />
            <DetailRow label="מיקום" value={lead.location} />
            <DetailRow label="גיל" value={lead.age?.toString()} />
            <DetailRow label="ניסיון" value={lead.experience} />
            <DetailRow label="תפקיד" value={lead.job_title} />
            <DetailRow label="תאריך יצירה" value={formatDate(lead.created_at)} />
          </div>
        </div>

        {/* Recruitment Info */}
        <div className="px-6 pb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">מידע גיוס</h3>
          <div className="bg-white rounded-lg border p-3">
            <DetailRow label="ציון סינון" value={lead.screening_score?.toString()} />
            <DetailRow label="תאריך ראיון" value={formatDate(lead.interview_date)} />
            <DetailRow label="הערות ראיון" value={lead.interview_notes} />
            <DetailRow label="לקוח" value={lead.hired_client} />
            <DetailRow label="תפקיד שהתקבל" value={lead.hired_position} />
            <DetailRow label="סיבת דחייה" value={lead.rejection_reason} />
            <DetailRow label="תאריך התחלה" value={formatDate(lead.start_date)} />
            <DetailRow label="תאריך הגעה" value={formatDate(lead.arrival_date)} />
          </div>
        </div>

        {/* Notes */}
        {(lead.notes || lead.followup_notes) && (
          <div className="px-6 pb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">הערות</h3>
            <div className="bg-white rounded-lg border p-3 space-y-2">
              {lead.notes && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
              )}
              {lead.followup_notes && (
                <div className="pt-2 border-t">
                  <span className="text-xs text-gray-500 block mb-1">הערות מעקב</span>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.followup_notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tags */}
        {lead.tags && lead.tags.length > 0 && (
          <div className="px-6 pb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">תגיות</h3>
            <div className="flex flex-wrap gap-1.5">
              {lead.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div className="sticky bottom-0 bg-white border-t p-4 mt-auto flex items-center gap-2">
          <div className="flex-1">
            <StatusSelect
              leadId={lead.id}
              currentStatus={lead.status}
              currentSubStatus={lead.sub_status}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Future: navigate to lead treatment page
            }}
            className="gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            קח לטיפול
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            סגור
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
