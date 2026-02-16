"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Lead, InteractionLog, Reminder, InteractionType, InteractionOutcome, ReminderPriority } from "@/types/leads";
import {
  INTERACTION_TYPES,
  INTERACTION_OUTCOMES,
  REMINDER_PRIORITIES,
} from "@/lib/constants";
import {
  getInteractionLogs,
  createInteractionLog,
  getActiveReminders,
  createReminder,
  completeReminder,
} from "../actions";

// ── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDueDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const CLIENT_TYPE_LABELS: Record<string, string> = {
  hotel: "מלון",
  restaurant: "מסעדה",
  construction: "בנייה",
  office: "משרד",
  other: "אחר",
};

const FINANCIAL_LABELS: Record<string, string> = {
  balanced: "מאוזן",
  delayed_payment: "עיכוב תשלום",
  debt: "חוב",
  bad_debt: "חוב אבוד",
};

const FINANCIAL_COLORS: Record<string, string> = {
  balanced: "bg-emerald-100 text-emerald-800",
  delayed_payment: "bg-amber-100 text-amber-800",
  debt: "bg-red-100 text-red-800",
  bad_debt: "bg-red-200 text-red-900",
};

// ── Icons ────────────────────────────────────────────────────

function PhoneInIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      <polyline points="16 2 16 8 22 8" />
    </svg>
  );
}

function PhoneOutIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      <polyline points="22 2 16 2 16 8" />
    </svg>
  );
}

function WhatsAppSmallIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function LoadingSpinner({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${className} animate-spin`}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

const TYPE_ICONS: Record<InteractionType, React.FC<{ className?: string }>> = {
  call_in: PhoneInIcon,
  call_out: PhoneOutIcon,
  whatsapp: WhatsAppSmallIcon,
};

const OUTCOME_COLORS: Record<InteractionOutcome, string> = {
  request: "bg-blue-100 text-blue-800",
  complaint: "bg-red-100 text-red-800",
  update: "bg-green-100 text-green-800",
  other: "bg-gray-100 text-gray-700",
};

// ── Component ────────────────────────────────────────────────

interface ConversationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
  mode: "call" | "whatsapp";
}

export function ConversationSheet({
  open,
  onOpenChange,
  lead,
  mode,
}: ConversationSheetProps) {
  // Data state
  const [logs, setLogs] = useState<InteractionLog[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingReminders, setLoadingReminders] = useState(false);

  // Log form state
  const [showLogForm, setShowLogForm] = useState(false);
  const defaultType: InteractionType = mode === "whatsapp" ? "whatsapp" : "call_out";
  const [logType, setLogType] = useState<InteractionType>(defaultType);
  const [logOutcome, setLogOutcome] = useState<InteractionOutcome>("other");
  const [logNotes, setLogNotes] = useState("");
  const [savingLog, setSavingLog] = useState(false);

  // Reminder form state
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderPriority, setReminderPriority] = useState<ReminderPriority>("normal");
  const [savingReminder, setSavingReminder] = useState(false);

  // Reset form defaults when mode changes
  useEffect(() => {
    setLogType(mode === "whatsapp" ? "whatsapp" : "call_out");
  }, [mode]);

  // Fetch data when sheet opens
  useEffect(() => {
    if (!open) return;
    fetchLogs();
    fetchReminders();
    // Reset forms on open
    setShowLogForm(false);
    setShowReminderForm(false);
    setLogNotes("");
    setLogOutcome("other");
    setLogType(mode === "whatsapp" ? "whatsapp" : "call_out");
    setReminderTitle("");
    setReminderDate("");
    setReminderPriority("normal");
  }, [open, lead.id, mode]);

  async function fetchLogs() {
    setLoadingLogs(true);
    const result = await getInteractionLogs(lead.id);
    setLogs(result.logs as InteractionLog[]);
    setLoadingLogs(false);
  }

  async function fetchReminders() {
    setLoadingReminders(true);
    const result = await getActiveReminders(lead.id);
    setReminders(result.reminders as Reminder[]);
    setLoadingReminders(false);
  }

  async function handleSaveLog() {
    setSavingLog(true);
    const result = await createInteractionLog(lead.id, logType, logOutcome, logNotes);
    setSavingLog(false);
    if (result.error) {
      toast.error("שגיאה בשמירת האינטראקציה");
    } else {
      toast.success("אינטראקציה נשמרה!");
      setShowLogForm(false);
      setLogNotes("");
      setLogOutcome("other");
      fetchLogs();
    }
  }

  async function handleSaveReminder() {
    if (!reminderTitle.trim() || !reminderDate) {
      toast.error("נא למלא כותרת ותאריך");
      return;
    }
    setSavingReminder(true);
    const result = await createReminder(lead.id, reminderTitle.trim(), reminderDate, reminderPriority);
    setSavingReminder(false);
    if (result.error) {
      toast.error("שגיאה בשמירת התזכורת");
    } else {
      toast.success("תזכורת נשמרה!");
      setShowReminderForm(false);
      setReminderTitle("");
      setReminderDate("");
      setReminderPriority("normal");
      fetchReminders();
    }
  }

  async function handleCompleteReminder(id: string) {
    const result = await completeReminder(id);
    if (result.error) {
      toast.error("שגיאה בעדכון התזכורת");
    } else {
      fetchReminders();
    }
  }

  const clientLabel = lead.client_type ? CLIENT_TYPE_LABELS[lead.client_type] ?? lead.client_type : null;
  const financialLabel = FINANCIAL_LABELS[lead.financial_status] ?? lead.financial_status;
  const financialColor = FINANCIAL_COLORS[lead.financial_status] ?? "bg-gray-100 text-gray-700";

  const prefs = (lead.preferences ?? {}) as Record<string, string>;
  const prefEntries = Object.entries(prefs).filter(([, v]) => v);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col overflow-hidden p-0" dir="rtl">
        {/* ── Header ──────────────────────────────────────── */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b flex-shrink-0">
          <SheetTitle className="text-lg">{lead.name}</SheetTitle>
          <SheetDescription className="text-sm">
            {mode === "call" ? "מצב שיחה" : "מצב וואטסאפ"}
          </SheetDescription>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {clientLabel && (
              <Badge variant="secondary" className="text-[11px]">
                {clientLabel}
              </Badge>
            )}
            <Badge className={`text-[11px] ${financialColor}`}>
              {financialLabel}
            </Badge>
          </div>
        </SheetHeader>

        {/* ── Scrollable content ──────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* History Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">היסטוריית אינטראקציות</h3>
            {loadingLogs ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner className="w-5 h-5 text-gray-400" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">אין היסטוריית אינטראקציות</p>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => {
                  const Icon = TYPE_ICONS[log.type];
                  return (
                    <div key={log.id} className="rounded-lg border bg-gray-50 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="text-xs font-medium text-gray-700">
                          {INTERACTION_TYPES[log.type]}
                        </span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${OUTCOME_COLORS[log.outcome]}`}>
                          {INTERACTION_OUTCOMES[log.outcome]}
                        </Badge>
                        <span className="text-[10px] text-gray-400 mr-auto" dir="ltr">
                          {formatDate(log.created_at)}
                        </span>
                      </div>
                      {log.notes && (
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{log.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Active Reminders */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">תזכורות פעילות</h3>
            {loadingReminders ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner className="w-5 h-5 text-gray-400" />
              </div>
            ) : reminders.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">אין תזכורות ממתינות</p>
            ) : (
              <div className="space-y-2">
                {reminders.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 rounded-lg border bg-gray-50 p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded"
                      onChange={() => handleCompleteReminder(r.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{r.title}</p>
                      <p className="text-[11px] text-gray-400">{formatDueDate(r.due_date)}</p>
                    </div>
                    {r.priority === "high" && (
                      <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0 flex-shrink-0">
                        {REMINDER_PRIORITIES.high}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Operational Notes (Preferences) */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">הערות תפעוליות</h3>
            {prefEntries.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">אין העדפות מוגדרות</p>
            ) : (
              <div className="space-y-2">
                {prefEntries.map(([key, value]) => (
                  <div key={key} className="rounded-lg border bg-gray-50 p-3">
                    <p className="text-[11px] text-gray-400 font-medium mb-0.5">{key}</p>
                    <p className="text-xs text-gray-700">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Quick Actions (sticky bottom) ───────────────── */}
        <div className="flex-shrink-0 border-t bg-white px-5 py-4 space-y-3">
          {/* Log Interaction */}
          {!showLogForm ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => { setShowLogForm(true); setShowReminderForm(false); }}
              >
                תיעוד אינטראקציה
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => { setShowReminderForm(true); setShowLogForm(false); }}
              >
                הגדר תזכורת
              </Button>
              <Button size="sm" variant="outline" disabled className="flex-1 opacity-50">
                משרה חדשה
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border bg-gray-50 p-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-medium text-gray-500 block mb-1">סוג</label>
                  <select
                    value={logType}
                    onChange={(e) => setLogType(e.target.value as InteractionType)}
                    className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs"
                  >
                    {Object.entries(INTERACTION_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-medium text-gray-500 block mb-1">תוצאה</label>
                  <select
                    value={logOutcome}
                    onChange={(e) => setLogOutcome(e.target.value as InteractionOutcome)}
                    className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs"
                  >
                    {Object.entries(INTERACTION_OUTCOMES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Textarea
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                rows={2}
                className="resize-none text-xs"
                placeholder="הערות..."
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveLog} disabled={savingLog} className="flex-1">
                  {savingLog ? "שומר..." : "שמור"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowLogForm(false)} className="flex-1">
                  ביטול
                </Button>
              </div>
            </div>
          )}

          {/* Set Reminder */}
          {showReminderForm && !showLogForm && (
            <div className="space-y-3 rounded-lg border bg-gray-50 p-3">
              <Input
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                placeholder="כותרת תזכורת..."
                className="text-xs"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-medium text-gray-500 block mb-1">תאריך</label>
                  <Input
                    type="date"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    className="text-xs"
                    dir="ltr"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-medium text-gray-500 block mb-1">עדיפות</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setReminderPriority("normal")}
                      className={`flex-1 text-xs rounded-md border px-2 py-1.5 ${
                        reminderPriority === "normal"
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-300"
                      }`}
                    >
                      {REMINDER_PRIORITIES.normal}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReminderPriority("high")}
                      className={`flex-1 text-xs rounded-md border px-2 py-1.5 ${
                        reminderPriority === "high"
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-white text-gray-600 border-gray-300"
                      }`}
                    >
                      {REMINDER_PRIORITIES.high}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveReminder} disabled={savingReminder} className="flex-1">
                  {savingReminder ? "שומר..." : "שמור"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowReminderForm(false)} className="flex-1">
                  ביטול
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
