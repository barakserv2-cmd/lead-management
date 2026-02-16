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
import type {
  Lead,
  InteractionLog,
  Reminder,
  InteractionType,
  InteractionOutcome,
  ReminderPriority,
} from "@/types/leads";
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
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDueDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const dateStr = d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
  });

  if (diffDays < 0) return `${dateStr} (באיחור)`;
  if (diffDays === 0) return `${dateStr} (היום)`;
  if (diffDays === 1) return `${dateStr} (מחר)`;
  return dateStr;
}

function isDueUrgent(iso: string) {
  const diffMs = new Date(iso).getTime() - Date.now();
  return diffMs < 1000 * 60 * 60 * 24; // less than 24h or overdue
}

// ── Status Maps ──────────────────────────────────────────────

const RECRUITMENT_LABELS: Record<string, string> = {
  active: "פעיל",
  frozen: "מוקפא",
  on_hold: "בהמתנה",
};

const RECRUITMENT_COLORS: Record<string, string> = {
  active: "bg-emerald-500 text-white",
  frozen: "bg-blue-100 text-blue-800",
  on_hold: "bg-amber-100 text-amber-800",
};

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

const PREF_LABELS: Record<string, string> = {
  client_preferences: "העדפות לקוח",
  past_issues: "בעיות קודמות",
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

type ActiveForm = null | "log" | "reminder";

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

  // Active form state — only one form visible at a time
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);

  // Log micro-form state
  const defaultType: InteractionType = mode === "whatsapp" ? "whatsapp" : "call_out";
  const [logType, setLogType] = useState<InteractionType>(defaultType);
  const [logOutcome, setLogOutcome] = useState<InteractionOutcome>("other");
  const [logNotes, setLogNotes] = useState("");
  const [savingLog, setSavingLog] = useState(false);

  // Reminder form state
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
    setActiveForm(null);
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
      setActiveForm(null);
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
      setActiveForm(null);
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

  // Derived values
  const isDebt = lead.financial_status === "debt" || lead.financial_status === "bad_debt";
  const isDelayed = lead.financial_status === "delayed_payment";
  const recruitLabel = RECRUITMENT_LABELS[lead.recruitment_status] ?? lead.recruitment_status;
  const recruitColor = RECRUITMENT_COLORS[lead.recruitment_status] ?? "bg-gray-100 text-gray-700";
  const clientLabel = lead.client_type ? CLIENT_TYPE_LABELS[lead.client_type] ?? lead.client_type : null;
  const financialLabel = FINANCIAL_LABELS[lead.financial_status] ?? lead.financial_status;
  const financialColor = FINANCIAL_COLORS[lead.financial_status] ?? "bg-gray-100 text-gray-700";
  const prefs = (lead.preferences ?? {}) as Record<string, string>;
  const prefEntries = Object.entries(prefs).filter(([, v]) => v);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-hidden p-0" dir="rtl">

        {/* ═══ 1. HEADER ═══════════════════════════════════════ */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b flex-shrink-0 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-xl font-bold truncate">{lead.name}</SheetTitle>
              <SheetDescription className="sr-only">כרטיס שיחה</SheetDescription>
            </div>
            {/* Live Interaction Indicator */}
            <div className="flex items-center gap-1.5 flex-shrink-0 rounded-full bg-green-50 border border-green-200 px-2.5 py-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[11px] font-semibold text-green-700">
                {mode === "call" ? "בשיחה" : "וואטסאפ"}
              </span>
            </div>
          </div>

          {/* Status badges row */}
          <div className="flex flex-wrap gap-1.5">
            <Badge className={`text-[11px] ${recruitColor}`}>{recruitLabel}</Badge>
            {clientLabel && (
              <Badge variant="secondary" className="text-[11px]">{clientLabel}</Badge>
            )}
            <Badge className={`text-[11px] ${financialColor}`}>{financialLabel}</Badge>
          </div>

          {/* Debt / Payment alert banner */}
          {(isDebt || isDelayed) && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
              isDebt
                ? "bg-red-50 border border-red-300 text-red-800"
                : "bg-amber-50 border border-amber-300 text-amber-800"
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" /><path d="M12 17h.01" />
              </svg>
              {isDebt ? "לקוח עם חוב — יש לטפל לפני המשך שיבוצים" : "עיכוב תשלום — שים לב בעת שיחה"}
            </div>
          )}
        </SheetHeader>

        {/* ═══ 2–4. SCROLLABLE CONTENT ═════════════════════════ */}
        <div className="flex-1 overflow-y-auto">

          {/* ── 2. Recent Interactions ─────────────────────── */}
          <section className="px-5 py-4 border-b">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">היסטוריית אינטראקציות</h3>
            {loadingLogs ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner className="w-5 h-5 text-gray-400" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-gray-300">
                    <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  </svg>
                </div>
                <p className="text-xs text-gray-400">אין היסטוריית אינטראקציות</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => {
                  const Icon = TYPE_ICONS[log.type];
                  return (
                    <div key={log.id} className="flex items-start gap-2.5 py-2 border-b border-gray-100 last:border-0">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
                        <Icon className="w-3.5 h-3.5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-800">
                            {INTERACTION_TYPES[log.type]}
                          </span>
                          <Badge className={`text-[10px] px-1.5 py-0 leading-4 ${OUTCOME_COLORS[log.outcome]}`}>
                            {INTERACTION_OUTCOMES[log.outcome]}
                          </Badge>
                        </div>
                        {log.notes && (
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{log.notes}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5 tabular-nums" dir="ltr">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── 3. Active Reminders ────────────────────────── */}
          <section className="px-5 py-4 border-b">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">תזכורות פעילות</h3>
            {loadingReminders ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner className="w-5 h-5 text-gray-400" />
              </div>
            ) : reminders.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">אין תזכורות ממתינות</p>
            ) : (
              <div className="space-y-2">
                {reminders.map((r) => {
                  const urgent = r.priority === "high" || isDueUrgent(r.due_date);
                  return (
                    <div
                      key={r.id}
                      className={`flex items-start gap-2.5 rounded-lg p-2.5 ${
                        urgent ? "bg-red-50 border border-red-200" : "bg-gray-50 border border-gray-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300 accent-blue-600"
                        onChange={() => handleCompleteReminder(r.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${urgent ? "text-red-800" : "text-gray-800"}`}>
                          {r.title}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${urgent ? "text-red-600 font-medium" : "text-gray-400"}`}>
                          {formatDueDate(r.due_date)}
                        </p>
                      </div>
                      {r.priority === "high" && (
                        <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0 flex-shrink-0">
                          {REMINDER_PRIORITIES.high}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── 4. Operational Notes ───────────────────────── */}
          <section className="px-5 py-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">הערות תפעוליות</h3>
            {prefEntries.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">אין הערות תפעוליות</p>
            ) : (
              <div className="space-y-2">
                {prefEntries.map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide mb-0.5">
                      {PREF_LABELS[key] ?? key}
                    </p>
                    <p className="text-xs text-gray-700 leading-relaxed">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ═══ 5. QUICK ACTIONS + FORMS (sticky bottom) ═══════ */}
        <div className="flex-shrink-0 border-t bg-gray-50">

          {/* ── Expanded: Log Micro-Form ──────────────────── */}
          {activeForm === "log" && (
            <div className="px-4 pt-3 pb-4 border-b bg-white space-y-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-700">תיעוד מהיר</span>
                <button type="button" onClick={() => setActiveForm(null)} className="text-gray-400 hover:text-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              {/* Row 1: Type + Outcome side-by-side (fast selection) */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="flex gap-1">
                    {(Object.entries(INTERACTION_TYPES) as [InteractionType, string][]).map(([k, v]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setLogType(k)}
                        className={`flex-1 text-[11px] rounded-md border px-1 py-1.5 font-medium transition-colors ${
                          logType === k
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Row 2: Outcome chips */}
              <div className="flex gap-1">
                {(Object.entries(INTERACTION_OUTCOMES) as [InteractionOutcome, string][]).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setLogOutcome(k)}
                    className={`flex-1 text-[11px] rounded-md border px-1 py-1.5 font-medium transition-colors ${
                      logOutcome === k
                        ? k === "complaint"
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {/* Row 3: Notes (optional) + Save */}
              <Textarea
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                rows={2}
                className="resize-none text-xs"
                placeholder="הערות קצרות (אופציונלי)..."
              />
              <Button
                size="sm"
                onClick={handleSaveLog}
                disabled={savingLog}
                className="w-full"
              >
                {savingLog ? "שומר..." : "שמור אינטראקציה"}
              </Button>
            </div>
          )}

          {/* ── Expanded: Reminder Form ───────────────────── */}
          {activeForm === "reminder" && (
            <div className="px-4 pt-3 pb-4 border-b bg-white space-y-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-700">תזכורת חדשה</span>
                <button type="button" onClick={() => setActiveForm(null)} className="text-gray-400 hover:text-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <Input
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                placeholder="כותרת תזכורת..."
                className="text-xs"
              />
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="text-xs flex-1"
                  dir="ltr"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setReminderPriority("normal")}
                    className={`text-[11px] rounded-md border px-3 py-1.5 font-medium transition-colors ${
                      reminderPriority === "normal"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200"
                    }`}
                  >
                    {REMINDER_PRIORITIES.normal}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReminderPriority("high")}
                    className={`text-[11px] rounded-md border px-3 py-1.5 font-medium transition-colors ${
                      reminderPriority === "high"
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-600 border-gray-200"
                    }`}
                  >
                    {REMINDER_PRIORITIES.high}
                  </button>
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleSaveReminder}
                disabled={savingReminder}
                className="w-full"
              >
                {savingReminder ? "שומר..." : "שמור תזכורת"}
              </Button>
            </div>
          )}

          {/* ── 5. Quick Action Button Grid ───────────────── */}
          <div className="grid grid-cols-3 gap-2 px-4 py-3">
            {/* Log Interaction */}
            <button
              type="button"
              onClick={() => setActiveForm(activeForm === "log" ? null : "log")}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors ${
                activeForm === "log"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-200"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <path d="M9 14h6" /><path d="M12 11v6" />
              </svg>
              תיעוד
            </button>

            {/* Set Reminder */}
            <button
              type="button"
              onClick={() => setActiveForm(activeForm === "reminder" ? null : "reminder")}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors ${
                activeForm === "reminder"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-200"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              תזכורת
            </button>

            {/* New Job */}
            <button
              type="button"
              disabled
              className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium bg-white text-gray-400 border-gray-200 opacity-60 cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                <rect width="20" height="14" x="2" y="6" rx="2" />
              </svg>
              משרה
            </button>

            {/* Send Candidates */}
            <button
              type="button"
              disabled
              className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium bg-white text-gray-400 border-gray-200 opacity-60 cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" />
                <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
              </svg>
              שלח מועמדים
            </button>

            {/* Flag Issue — Red */}
            <button
              type="button"
              onClick={() => {
                setActiveForm("log");
                setLogOutcome("complaint");
              }}
              className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium bg-white text-red-600 border-red-200 hover:bg-red-50 transition-colors col-span-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" x2="4" y1="22" y2="15" />
              </svg>
              דיווח תקלה
            </button>
          </div>
        </div>

      </SheetContent>
    </Sheet>
  );
}
