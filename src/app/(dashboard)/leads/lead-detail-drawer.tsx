"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Lead } from "@/types/leads";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  updateLeadNotes,
  updateLeadPreferences,
  updateLeadDetails,
  getStatusHistory,
  getLeadNotes,
} from "./actions";
import { StatusSelect } from "./status-select";
import { ConversationSheet } from "./[id]/conversation-sheet";
import { ChatHistory } from "./[id]/chat-history";
import {
  STATUS_COLORS as SM_COLORS,
  STATUS_LABELS,
  type LeadStatusValue,
} from "@/lib/stateMachine";

// ── Helpers ──────────────────────────────────────────────────

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

function PhoneIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function MailIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
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

function MapPinIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
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
    return <div className="flex items-center justify-center py-8 text-gray-400 text-sm">טוען היסטוריה...</div>;
  }

  return (
    <div className="relative pr-4">
      <div className="absolute right-[7px] top-2 bottom-2 w-0.5 bg-gray-200" />
      <div className="relative flex items-start gap-3 pb-4">
        <div className="relative z-10 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white shadow mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-gray-800">ליד נוצר</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(createdAt).toLocaleDateString("he-IL")} {new Date(createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
      {entries.length > 0 ? entries.map((entry) => (
        <div key={entry.id} className="relative flex items-start gap-3 pb-4">
          <div className={`relative z-10 w-3.5 h-3.5 rounded-full border-2 border-white shadow mt-0.5 flex-shrink-0 ${getStatusDotColor(entry.to_status)}`} />
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
              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${getStatusColorClasses(entry.to_status)}`}>
                {getStatusLabel(entry.to_status)}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(entry.changed_at).toLocaleDateString("he-IL")} {new Date(entry.changed_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      )) : (
        <div className="py-4 text-center text-gray-400 text-xs">אין שינויי סטטוס עדיין</div>
      )}
    </div>
  );
}

// ── Main Drawer Component ───────────────────────────────────

export function LeadDetailDrawer({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const router = useRouter();

  // Display state
  const [displayName, setDisplayName] = useState(lead.name);
  const [displayPhone, setDisplayPhone] = useState<string | null>(lead.phone);
  const [displayEmail, setDisplayEmail] = useState<string | null>(lead.email);
  const [displayJobTitle, setDisplayJobTitle] = useState<string | null>(lead.job_title);

  // Notes
  const [notes, setNotes] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // Preferences
  const initPrefs = (lead.preferences ?? {}) as Record<string, string>;
  const [clientPrefs, setClientPrefs] = useState(initPrefs.client_preferences ?? "");
  const [pastIssues, setPastIssues] = useState(initPrefs.past_issues ?? "");
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Conversation sheet
  const [convOpen, setConvOpen] = useState(false);
  const [convMode, setConvMode] = useState<"call" | "whatsapp">("call");

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editExperience, setEditExperience] = useState("");
  const [editAge, setEditAge] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // History
  const [historyEntries, setHistoryEntries] = useState<Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    changed_at: string;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Reset all state when lead changes
  useEffect(() => {
    setDisplayName(lead.name);
    setDisplayPhone(lead.phone);
    setDisplayEmail(lead.email);
    setDisplayJobTitle(lead.job_title);

    const prefs = (lead.preferences ?? {}) as Record<string, string>;
    setClientPrefs(prefs.client_preferences ?? "");
    setPastIssues(prefs.past_issues ?? "");

    setHistoryEntries([]);
    setHistoryLoaded(false);

    // Fetch fresh notes
    setNotesLoading(true);
    getLeadNotes(lead.id).then((result) => {
      setNotes(result.notes ?? "");
      setNotesLoading(false);
    });
  }, [lead]);

  const loadHistory = useCallback(async () => {
    if (historyLoaded) return;
    setHistoryLoading(true);
    const result = await getStatusHistory(lead.id);
    setHistoryEntries(result.history);
    setHistoryLoading(false);
    setHistoryLoaded(true);
  }, [lead.id, historyLoaded]);

  const intlPhone = formatPhone(displayPhone);
  const prefs = (lead.preferences ?? {}) as Record<string, string>;

  function openEditDialog() {
    setEditName(displayName);
    setEditPhone(displayPhone ?? "");
    setEditEmail(displayEmail ?? "");
    setEditJobTitle(displayJobTitle ?? "");
    setEditLocation(lead.location ?? "");
    setEditExperience(lead.experience ?? "");
    setEditAge(lead.age?.toString() ?? "");
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
    });
    setSavingEdit(false);
    if (result.error) {
      toast.error("שגיאה בעדכון הפרטים");
    } else {
      setDisplayName(editName.trim());
      setDisplayPhone(editPhone.trim() || null);
      setDisplayEmail(editEmail.trim() || null);
      setDisplayJobTitle(editJobTitle.trim() || null);
      setEditOpen(false);
      toast.success("הפרטים עודכנו!");
      router.refresh();
    }
  }

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

  const contactFields = [
    { icon: <PhoneIcon className="w-4 h-4" />, label: "טלפון", value: displayPhone, dir: "ltr" as const, color: "bg-cyan-50 text-cyan-600" },
    { icon: <MailIcon className="w-4 h-4" />, label: "אימייל", value: displayEmail, dir: "ltr" as const, color: "bg-violet-50 text-violet-600" },
    { icon: <MapPinIcon className="w-4 h-4" />, label: "מיקום", value: lead.location, color: "bg-teal-50 text-teal-600" },
  ];

  return (
    <>
      <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="!w-full !max-w-5xl p-0 flex flex-col overflow-hidden"
        >
          {/* ═══ HEADER ═══════════════════════════════════════════ */}
          <SheetHeader className="flex-shrink-0 border-b bg-white px-6 py-4">
            <div className="flex items-center gap-4">
              {/* Close button */}
              <button
                type="button"
                onClick={onClose}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="m12 19 7-7-7-7" /><path d="M19 12H5" />
                </svg>
              </button>

              {/* Avatar */}
              <span className="flex-shrink-0 w-11 h-11 rounded-full bg-cyan-600 text-white flex items-center justify-center text-base font-bold">
                {getInitials(displayName)}
              </span>

              {/* Name + status */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <SheetTitle className="text-xl truncate">{displayName}</SheetTitle>
                  <SheetDescription asChild>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColorClasses(lead.status)}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(lead.status)}`} />
                      {getStatusLabel(lead.status)}
                    </span>
                  </SheetDescription>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-sm text-gray-500">
                  {displayPhone && <span dir="ltr">{displayPhone}</span>}
                  {displayPhone && displayJobTitle && <span>·</span>}
                  {displayJobTitle && <span>{displayJobTitle}</span>}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusSelect
                  leadId={lead.id}
                  currentStatus={lead.status}
                  currentSubStatus={lead.sub_status}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openEditDialog}
                  className="text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 gap-1"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                  <span className="text-xs">עריכה</span>
                </Button>
                {intlPhone ? (
                  <>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-xs"
                      onClick={() => {
                        setConvMode("whatsapp");
                        setConvOpen(true);
                        setTimeout(() => {
                          window.open("https://api.whatsapp.com/send?phone=" + intlPhone, "_blank", "noopener,noreferrer");
                        }, 300);
                      }}
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      <span className="mr-1">WhatsApp</span>
                    </Button>
                    <Button
                      size="sm"
                      className="bg-cyan-600 hover:bg-cyan-700 text-white h-8 px-3 text-xs"
                      onClick={() => {
                        setConvMode("call");
                        setConvOpen(true);
                        setTimeout(() => {
                          const a = document.createElement("a");
                          a.href = "tel:" + lead.phone;
                          a.click();
                        }, 300);
                      }}
                    >
                      <PhoneIcon className="w-3.5 h-3.5" />
                      <span className="mr-1">התקשר</span>
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </SheetHeader>

          {/* ═══ TWO-PANEL BODY ═══════════════════════════════════ */}
          <div className="flex-1 flex min-h-0 overflow-hidden">

            {/* ── LEFT: Contact Info + Tabs ───────────────────── */}
            <div className="w-[380px] flex-shrink-0 border-l overflow-y-auto bg-white">
              {/* Contact fields */}
              <div className="p-5 space-y-3 border-b">
                {contactFields.map((f) => (
                  <div key={f.label} className="flex items-center gap-3">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${f.color} flex items-center justify-center`}>
                      {f.icon}
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400 font-medium">{f.label}</p>
                      <p className="text-sm font-semibold text-gray-800" dir={f.dir}>
                        {f.value ?? "—"}
                      </p>
                    </div>
                  </div>
                ))}
                {/* Extra info row */}
                <div className="flex gap-4 text-xs text-gray-500 pt-1">
                  {lead.experience && (
                    <span><span className="font-medium text-gray-700">ניסיון:</span> {lead.experience}</span>
                  )}
                  {lead.age && (
                    <span><span className="font-medium text-gray-700">גיל:</span> {lead.age}</span>
                  )}
                </div>
              </div>

              {/* Tabs: Notes / History / Preferences */}
              <div className="p-5">
                <Tabs defaultValue="notes" dir="rtl">
                  <TabsList className="w-full">
                    <TabsTrigger value="notes" className="flex-1 text-xs">הערות</TabsTrigger>
                    <TabsTrigger value="history" className="flex-1 text-xs">היסטוריה</TabsTrigger>
                    <TabsTrigger value="preferences" className="flex-1 text-xs">העדפות</TabsTrigger>
                  </TabsList>

                  <TabsContent value="notes" className="mt-3 space-y-3">
                    {notesLoading ? (
                      <div className="flex items-center justify-center py-8 text-gray-400 text-sm">טוען...</div>
                    ) : (
                      <>
                        <Textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={8}
                          className="resize-none text-sm"
                          placeholder="הערות כלליות על המועמד..."
                        />
                        <Button onClick={handleSaveNotes} disabled={savingNotes} className="w-full" size="sm">
                          {savingNotes ? "שומר..." : "שמור הערות"}
                        </Button>
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="history" className="mt-3">
                    <HistoryTimeline
                      entries={historyEntries}
                      loading={historyLoading}
                      createdAt={lead.created_at}
                      onLoad={loadHistory}
                    />
                  </TabsContent>

                  <TabsContent value="preferences" className="mt-3 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">העדפות מועמד</label>
                      <Textarea
                        value={clientPrefs}
                        onChange={(e) => setClientPrefs(e.target.value)}
                        rows={3}
                        className="resize-none text-sm"
                        placeholder='לדוגמה: "מעדיף עובדים עם ניסיון של 3+ שנים"'
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">בעיות קודמות</label>
                      <Textarea
                        value={pastIssues}
                        onChange={(e) => setPastIssues(e.target.value)}
                        rows={3}
                        className="resize-none text-sm"
                        placeholder='לדוגמה: "עיכובים בתשלום ברבעון 3"'
                      />
                    </div>
                    <Button onClick={handleSavePreferences} disabled={savingPrefs} className="w-full" size="sm">
                      {savingPrefs ? "שומר..." : "שמור העדפות"}
                    </Button>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            {/* ── RIGHT: AI Chat ──────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#f8f9fa]">
              <div className="flex items-center gap-2 px-5 py-3 border-b bg-white">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <h3 className="text-sm font-semibold text-gray-800">צ&apos;אט סינון AI</h3>
              </div>
              <div className="flex-1 min-h-0">
                <ChatHistory
                  leadId={lead.id}
                  leadStatus={lead.status as LeadStatusValue}
                />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ═══ EDIT DIALOG ════════════════════════════════════════ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת פרטי ליד</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="drawer-edit-name">שם מלא *</Label>
              <Input id="drawer-edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="שם מלא" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="drawer-edit-phone">טלפון</Label>
              <Input id="drawer-edit-phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="050-1234567" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="drawer-edit-email">אימייל</Label>
              <Input id="drawer-edit-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="email@example.com" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="drawer-edit-job-title">תפקיד</Label>
              <Input id="drawer-edit-job-title" value={editJobTitle} onChange={(e) => setEditJobTitle(e.target.value)} placeholder="תפקיד נוכחי" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="drawer-edit-location">מיקום</Label>
                <Input id="drawer-edit-location" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="עיר / אזור" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drawer-edit-age">גיל</Label>
                <Input id="drawer-edit-age" type="number" min={1} max={119} value={editAge} onChange={(e) => setEditAge(e.target.value)} placeholder="גיל" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="drawer-edit-experience">ניסיון</Label>
              <Input id="drawer-edit-experience" value={editExperience} onChange={(e) => setEditExperience(e.target.value)} placeholder="שנות ניסיון / תיאור" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>ביטול</Button>
            <Button onClick={handleSaveDetails} disabled={savingEdit || !editName.trim()}>
              {savingEdit ? "שומר..." : "שמור שינויים"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ CONVERSATION SHEET ══════════════════════════════════ */}
      <ConversationSheet
        open={convOpen}
        onOpenChange={setConvOpen}
        lead={lead}
        mode={convMode}
      />
    </>
  );
}
