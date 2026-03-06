"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { Lead } from "@/types/leads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { calcTimer, timerColor } from "@/lib/employmentTimer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  updateLeadNotes,
  updateLeadPreferences,
  updateLeadDetails,
  getStatusHistory,
  normalizeEmployer,
} from "../actions";
import { STATUS_COLORS as SM_COLORS, STATUS_LABELS, type LeadStatusValue } from "@/lib/stateMachine";

function getStatusColorClasses(status: string): string {
  const c = SM_COLORS[status as LeadStatusValue];
  if (c) return `${c.bg} ${c.text}`;
  return "bg-gray-100 text-gray-800";
}

function getStatusDotColor(status: string): string {
  const c = SM_COLORS[status as LeadStatusValue];
  if (c) return c.dot;
  return "bg-gray-500";
}

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status as LeadStatusValue] ?? status;
}
import { ConversationSheet } from "./conversation-sheet";
import { ChatHistory } from "./chat-history";

// ── Helpers ──────────────────────────────────────────────────

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "972");
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.slice(0, 2);
}

// ── Icons ────────────────────────────────────────────────────

function PhoneIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function WhatsAppIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function MailIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function BriefcaseIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </svg>
  );
}

function MapPinIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PencilIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </svg>
  );
}

function ArrowRightIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function UsersIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" />
      <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
    </svg>
  );
}

function BuildingIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" /><path d="M16 6h.01" />
      <path d="M8 10h.01" /><path d="M16 10h.01" />
      <path d="M8 14h.01" /><path d="M16 14h.01" />
    </svg>
  );
}

function ClipboardIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

// ── History Timeline ────────────────────────────────────────

function HistoryTimeline({
  entries,
  loading,
  createdAt,
  onLoad,
}: {
  entries: Array<{ id: string; from_status: string | null; to_status: string; changed_at: string }>;
  loading: boolean;
  createdAt: string;
  onLoad: () => void;
}) {
  useEffect(() => { onLoad(); }, [onLoad]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
        טוען היסטוריה...
      </div>
    );
  }

  const hasEntries = entries.length > 0;

  return (
    <div className="relative pr-4">
      {/* Vertical line */}
      <div className="absolute right-[7px] top-2 bottom-2 w-0.5 bg-gray-200" />

      {/* Created entry */}
      <div className="relative flex items-start gap-3 pb-4">
        <div className="relative z-10 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white shadow mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-gray-800">ליד נוצר</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(createdAt).toLocaleDateString("he-IL")}
            {" "}
            {new Date(createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>

      {/* Status change entries */}
      {hasEntries ? entries.map((entry) => {
        const statusColor = getStatusColorClasses(entry.to_status);
        const dotColor = getStatusDotColor(entry.to_status);

        return (
          <div key={entry.id} className="relative flex items-start gap-3 pb-4">
            <div className={`relative z-10 w-3.5 h-3.5 rounded-full border-2 border-white shadow mt-0.5 flex-shrink-0 ${dotColor}`} />
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {entry.from_status && (
                  <>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${getStatusColorClasses(entry.from_status)}`}>
                      {getStatusLabel(entry.from_status)}
                    </span>
                    <span className="text-gray-400 text-xs">&larr;</span>
                  </>
                )}
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColor}`}>
                  {getStatusLabel(entry.to_status)}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(entry.changed_at).toLocaleDateString("he-IL")}
                {" "}
                {new Date(entry.changed_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        );
      }) : (
        <div className="py-4 text-center text-gray-400 text-xs">
          אין שינויי סטטוס עדיין
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export function LeadDetail({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(lead.name);
  const [displayPhone, setDisplayPhone] = useState(lead.phone);
  const [displayEmail, setDisplayEmail] = useState(lead.email);
  const [displayJobTitle, setDisplayJobTitle] = useState(lead.job_title);

  const [notes, setNotes] = useState(lead.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  const prefs = (lead.preferences ?? {}) as Record<string, string>;
  const [clientPrefs, setClientPrefs] = useState(prefs.client_preferences ?? "");
  const [pastIssues, setPastIssues] = useState(prefs.past_issues ?? "");
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Conversation sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"call" | "whatsapp">("call");

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(lead.name);
  const [editPhone, setEditPhone] = useState(lead.phone ?? "");
  const [editEmail, setEditEmail] = useState(lead.email ?? "");
  const [editJobTitle, setEditJobTitle] = useState(lead.job_title ?? "");
  const [editLocation, setEditLocation] = useState(lead.location ?? "");
  const [editExperience, setEditExperience] = useState(lead.experience ?? "");
  const [editAge, setEditAge] = useState(lead.age?.toString() ?? "");
  const [editStartDate, setEditStartDate] = useState(lead.start_date ?? "");
  const [editHiredClient, setEditHiredClient] = useState(lead.hired_client ?? "");
  const [employerHint, setEmployerHint] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // History state
  const [historyEntries, setHistoryEntries] = useState<Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    changed_at: string;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const loadHistory = useCallback(async () => {
    if (historyLoaded) return;
    setHistoryLoading(true);
    const result = await getStatusHistory(lead.id);
    setHistoryEntries(result.history);
    setHistoryLoading(false);
    setHistoryLoaded(true);
  }, [lead.id, historyLoaded]);

  const intlPhone = formatPhone(displayPhone);

  const isHiredOrStarted = lead.status === "HIRED" || lead.status === "STARTED";
  const hasEmployer = Boolean(lead.hired_client);
  const canSetStartDate = isHiredOrStarted && hasEmployer;

  function openEditDialog() {
    setEditName(displayName);
    setEditPhone(displayPhone ?? "");
    setEditEmail(displayEmail ?? "");
    setEditJobTitle(displayJobTitle ?? "");
    setEditLocation(lead.location ?? "");
    setEditExperience(lead.experience ?? "");
    setEditAge(lead.age?.toString() ?? "");
    setEditStartDate(lead.start_date ?? "");
    setEditHiredClient(lead.hired_client ?? "");
    setEmployerHint(null);
    setEditOpen(true);
  }

  async function handleSaveDetails() {
    if (!editName.trim()) {
      toast.error("שם הוא שדה חובה");
      return;
    }
    setSavingEdit(true);
    const result = await updateLeadDetails(lead.id, {
      name: editName.trim(),
      phone: editPhone.trim(),
      email: editEmail.trim(),
      job_title: editJobTitle.trim(),
      location: editLocation.trim(),
      experience: editExperience.trim(),
      age: editAge.trim(),
      start_date: editStartDate.trim(),
      hired_client: editHiredClient.trim(),
    });
    setSavingEdit(false);
    if (result.error) {
      toast.error("שגיאה בעדכון הפרטים");
    } else {
      if (result.normalizedEmployer && editHiredClient.trim() && result.normalizedEmployer !== editHiredClient.trim()) {
        toast.success(`שם מעסיק תוקן אוטומטית ל: "${result.normalizedEmployer}"`);
      }
      setDisplayName(editName.trim());
      setDisplayPhone(editPhone.trim() || null);
      setDisplayEmail(editEmail.trim() || null);
      setDisplayJobTitle(editJobTitle.trim() || null);
      setEditOpen(false);
      toast.success("הפרטים עודכנו!");
      router.refresh();
    }
  }

  // Debounced employer name normalization preview
  useEffect(() => {
    const trimmed = editHiredClient.trim();
    if (!trimmed || trimmed.length < 2) {
      setEmployerHint(null);
      return;
    }
    const timer = setTimeout(async () => {
      const result = await normalizeEmployer(trimmed);
      if (result.wasNormalized && result.bestMatch && result.bestMatch !== trimmed) {
        setEmployerHint(`יתוקן ל: "${result.bestMatch}" (דמיון: ${Math.round((result.score ?? 0) * 100)}%)`);
      } else {
        setEmployerHint(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [editHiredClient]);

  async function handleSaveNotes() {
    setSavingNotes(true);
    const result = await updateLeadNotes(lead.id, notes);
    setSavingNotes(false);
    if (result.error) toast.error("שגיאה בשמירה");
    else toast.success("הערות נשמרו!");
  }

  async function handleSavePreferences() {
    setSavingPrefs(true);
    const result = await updateLeadPreferences(lead.id, {
      ...prefs,
      client_preferences: clientPrefs,
      past_issues: pastIssues,
    });
    setSavingPrefs(false);
    if (result.error) toast.error("שגיאה בשמירה");
    else toast.success("העדפות נשמרו!");
  }

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-cyan-600 transition-colors"
      >
        <ArrowRightIcon className="w-4 h-4" />
        חזרה לרשימה
      </Link>

      {/* ═══ COMPACT HEADER ═══════════════════════════════════ */}
      <div className="bg-white rounded-xl border shadow-sm px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="flex-shrink-0 w-12 h-12 rounded-full bg-cyan-600 text-white flex items-center justify-center text-lg font-bold">
            {getInitials(displayName)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 truncate">
                {displayName}
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColorClasses(lead.status)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(lead.status)}`} />
                {getStatusLabel(lead.status)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={openEditDialog}
                className="text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 flex-shrink-0 gap-1"
                title="ערוך פרטים"
              >
                <PencilIcon className="w-4 h-4" />
                <span className="text-xs">עריכה</span>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* Inline action buttons */}
              {intlPhone ? (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white h-7 px-2.5 text-xs"
                  onClick={() => {
                    setSheetMode("whatsapp");
                    setSheetOpen(true);
                    setTimeout(() => {
                      window.open("https://api.whatsapp.com/send?phone=" + intlPhone, "_blank", "noopener,noreferrer");
                    }, 300);
                  }}
                >
                  <WhatsAppIcon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline mr-1">WhatsApp</span>
                </Button>
              ) : (
                <Button size="sm" disabled className="bg-green-600 text-white h-7 px-2.5 text-xs">
                  <WhatsAppIcon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline mr-1">WhatsApp</span>
                </Button>
              )}
              {lead.phone ? (
                <Button
                  size="sm"
                  className="bg-cyan-600 hover:bg-cyan-700 text-white h-7 px-2.5 text-xs"
                  onClick={() => {
                    setSheetMode("call");
                    setSheetOpen(true);
                    setTimeout(() => {
                      const a = document.createElement("a");
                      a.href = "tel:" + lead.phone;
                      a.click();
                    }, 300);
                  }}
                >
                  <PhoneIcon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline mr-1">התקשר</span>
                </Button>
              ) : (
                <Button size="sm" disabled className="bg-cyan-600 text-white h-7 px-2.5 text-xs">
                  <PhoneIcon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline mr-1">התקשר</span>
                </Button>
              )}
              {lead.email ? (
                <Button asChild size="sm" className="bg-gray-600 hover:bg-gray-700 text-white h-7 px-2.5 text-xs">
                  <a href={"mailto:" + lead.email}>
                    <MailIcon className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline mr-1">אימייל</span>
                  </a>
                </Button>
              ) : (
                <Button size="sm" disabled className="bg-gray-600 text-white h-7 px-2.5 text-xs">
                  <MailIcon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline mr-1">אימייל</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ EMPLOYMENT TIMER ═══════════════════════════════ */}
      {(() => {
        const timer = calcTimer(lead.start_date);
        if (!timer) {
          return (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 px-6 py-4 flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                <ClipboardIcon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">טיימר העסקה</p>
                {canSetStartDate ? (
                  <p className="text-xs text-gray-400">הגדר תאריך תחילת עבודה כדי להפעיל את הטיימר (6 חודשים).</p>
                ) : (
                  <p className="text-xs text-amber-600">ניתן לקבוע תאריך תחילת עבודה רק לאחר עדכון סטטוס ל&quot;התקבל&quot; ובחירת מעסיק.</p>
                )}
              </div>
              {canSetStartDate && (
                <Button variant="outline" size="sm" className="mr-auto text-xs flex-shrink-0" onClick={openEditDialog}>
                  הגדר תאריך
                </Button>
              )}
            </div>
          );
        }

        const color = timerColor(timer);
        const barColor = color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-500" : "bg-red-500";
        const bgColor = color === "green" ? "bg-emerald-50 border-emerald-200" : color === "amber" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
        const textColor = color === "green" ? "text-emerald-700" : color === "amber" ? "text-amber-700" : "text-red-700";

        return (
          <div className={`rounded-xl border px-6 py-4 ${bgColor}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-lg ${textColor}`}>&#9203;</span>
                <span className={`text-sm font-bold ${textColor}`}>טיימר העסקה (6 חודשים)</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>התחלה: {timer.startDate.toLocaleDateString("he-IL")}</span>
                <span>סיום: {timer.endDate.toLocaleDateString("he-IL")}</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-3 rounded-full bg-white/80 border border-gray-200/60 overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${Math.min(timer.percentUsed, 100)}%` }}
              />
            </div>

            {timer.expired ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-bold">
                  &#9888; תקופת ההעסקה (6 חודשים) הסתיימה!
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${textColor}`}>
                  {timer.remainingMonths > 0
                    ? `נשארו ${timer.remainingMonths} חודשים ו-${timer.remainingExtraDays} ימים`
                    : `נשארו ${timer.remainingDays} ימים`}
                </span>
                <span className="text-xs text-gray-500">
                  {Math.round(timer.percentUsed)}% מהתקופה חלפו
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ TWO-PANEL LAYOUT ════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: "calc(100vh - 220px)" }}>

        {/* ── LEFT PANEL: Contact Info + Tabs ────────────── */}
        <div className="w-full lg:w-[420px] flex-shrink-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">פרטי קשר</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-600">
                    <PhoneIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-medium">טלפון</p>
                    <p className="text-sm font-semibold text-gray-800" dir="ltr">
                      {displayPhone ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                    <MailIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-medium">אימייל</p>
                    <p className="text-sm font-semibold text-gray-800" dir="ltr">
                      {displayEmail ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
                    <MapPinIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-medium">מיקום</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {lead.location ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                    <BuildingIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-medium">מעסיק</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {(lead.preferences as Record<string, unknown>)?.matched_client as string ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <ClipboardIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-medium">תאריך תחילת עבודה</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {lead.start_date
                        ? new Date(lead.start_date).toLocaleDateString("he-IL")
                        : "לא הוגדר"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">מידע נוסף</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="notes" dir="rtl">
                <TabsList className="w-full">
                  <TabsTrigger value="notes" className="flex-1 text-xs">
                    הערות
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1 text-xs">
                    היסטוריה
                  </TabsTrigger>
                  <TabsTrigger value="preferences" className="flex-1 text-xs">
                    העדפות
                  </TabsTrigger>
                </TabsList>

                {/* Notes */}
                <TabsContent value="notes" className="mt-3 space-y-3">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={7}
                    className="resize-none text-sm"
                    placeholder="הערות כלליות על המועמד..."
                  />
                  <Button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="w-full"
                    size="sm"
                  >
                    {savingNotes ? "שומר..." : "שמור הערות"}
                  </Button>
                </TabsContent>

                {/* History */}
                <TabsContent value="history" className="mt-3">
                  <HistoryTimeline
                    entries={historyEntries}
                    loading={historyLoading}
                    createdAt={lead.created_at}
                    onLoad={loadHistory}
                  />
                </TabsContent>

                {/* Preferences */}
                <TabsContent value="preferences" className="mt-3 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">
                      העדפות מועמד
                    </label>
                    <Textarea
                      value={clientPrefs}
                      onChange={(e) => setClientPrefs(e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                      placeholder='לדוגמה: "מחפש עבודה במלונאות כולל מגורים, זמין למשמרות בוקר בלבד"'
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">
                      בעיות קודמות
                    </label>
                    <Textarea
                      value={pastIssues}
                      onChange={(e) => setPastIssues(e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                      placeholder='לדוגמה: "לא הופיע לראיון שנקבע בעבר, עזב עבודה קודמת ללא התראה"'
                    />
                  </div>
                  <Button
                    onClick={handleSavePreferences}
                    disabled={savingPrefs}
                    className="w-full"
                    size="sm"
                  >
                    {savingPrefs ? "שומר..." : "שמור העדפות"}
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT PANEL: WhatsApp Chat ─────────────────── */}
        <div className="flex-1 min-w-0">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {lead.status === "SCREENING_IN_PROGRESS" ? "שיחת סינון AI" : "שיחת WhatsApp"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 min-h-0">
              <ChatHistory
                leadId={lead.id}
                leadStatus={lead.status as LeadStatusValue}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══ EDIT DETAILS DIALOG ═══════════════════════════════ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת פרטי ליד</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">שם מלא *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="שם מלא"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">טלפון</Label>
              <Input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="050-1234567"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">אימייל</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="email@example.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-job-title">תפקיד</Label>
              <Input
                id="edit-job-title"
                value={editJobTitle}
                onChange={(e) => setEditJobTitle(e.target.value)}
                placeholder="תפקיד נוכחי"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="edit-location">מיקום</Label>
                <Input
                  id="edit-location"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="עיר / אזור"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-age">גיל</Label>
                <Input
                  id="edit-age"
                  type="number"
                  min={1}
                  max={119}
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                  placeholder="גיל"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-experience">ניסיון</Label>
              <Input
                id="edit-experience"
                value={editExperience}
                onChange={(e) => setEditExperience(e.target.value)}
                placeholder="שנות ניסיון / תיאור"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-hired-client">מעסיק</Label>
              <Input
                id="edit-hired-client"
                value={editHiredClient}
                onChange={(e) => setEditHiredClient(e.target.value)}
                placeholder="שם המעסיק / החברה"
              />
              {employerHint && (
                <p className="text-[11px] text-cyan-600 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 flex-shrink-0">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                  {employerHint}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-start-date" className={canSetStartDate ? "" : "text-gray-400"}>תאריך תחילת עבודה</Label>
              <Input
                id="edit-start-date"
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                disabled={!canSetStartDate}
                dir="ltr"
                className={canSetStartDate ? "" : "opacity-50 cursor-not-allowed"}
              />
              {!canSetStartDate && (
                <p className="text-[11px] text-amber-600">
                  ניתן לקבוע תאריך תחילת עבודה רק לאחר עדכון סטטוס ל&quot;התקבל&quot; ובחירת מעסיק.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={savingEdit}
            >
              ביטול
            </Button>
            <Button
              onClick={handleSaveDetails}
              disabled={savingEdit || !editName.trim()}
            >
              {savingEdit ? "שומר..." : "שמור שינויים"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ CONVERSATION SHEET ════════════════════════════════ */}
      <ConversationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        lead={lead}
        mode={sheetMode}
      />
    </div>
  );
}
