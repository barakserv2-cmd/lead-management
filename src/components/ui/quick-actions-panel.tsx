"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageCircle,
  Bell,
  Briefcase,
  Users,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  createInteractionLog,
  createReminder,
} from "@/app/(dashboard)/leads/actions";
import {
  INTERACTION_TYPES,
  INTERACTION_OUTCOMES,
  REMINDER_PRIORITIES,
} from "@/lib/constants";
import type {
  InteractionType,
  InteractionOutcome,
  ReminderPriority,
} from "@/types/leads";

// ── Types ────────────────────────────────────────────────────

type ActiveAction = null | "log" | "reminder" | "job" | "candidates" | "flag";

interface QuickActionsProps {
  clientId: string;
  onActionComplete?: () => void;
}

// ── Component ────────────────────────────────────────────────

export default function QuickActionsPanel({ clientId, onActionComplete }: QuickActionsProps) {
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  // Log form state
  const [logType, setLogType] = useState<InteractionType>("call_out");
  const [logOutcome, setLogOutcome] = useState<InteractionOutcome>("other");
  const [logNotes, setLogNotes] = useState("");
  const [savingLog, setSavingLog] = useState(false);

  // Reminder form state
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderPriority, setReminderPriority] = useState<ReminderPriority>("normal");
  const [savingReminder, setSavingReminder] = useState(false);

  // Job form state (placeholder)
  const [jobTitle, setJobTitle] = useState("");
  const [jobPay, setJobPay] = useState("");
  const [jobLocation, setJobLocation] = useState("אילת");
  const [jobShift, setJobShift] = useState("בוקר");

  // Flag form state
  const [flagSeverity, setFlagSeverity] = useState("Medium");
  const [flagType, setFlagType] = useState("Operational Issue");
  const [flagNotes, setFlagNotes] = useState("");
  const [savingFlag, setSavingFlag] = useState(false);

  // ── Handlers ─────────────────────────────────────────────

  function resetForm() {
    setActiveAction(null);
    setLogNotes("");
    setLogOutcome("other");
    setReminderTitle("");
    setReminderDate("");
    setReminderPriority("normal");
    setJobTitle("");
    setJobPay("");
    setJobLocation("אילת");
    setJobShift("בוקר");
    setFlagSeverity("Medium");
    setFlagType("Operational Issue");
    setFlagNotes("");
  }

  async function handleSaveLog() {
    setSavingLog(true);
    const result = await createInteractionLog(clientId, logType, logOutcome, logNotes);
    setSavingLog(false);
    if (result.error) {
      toast.error("שגיאה בשמירת האינטראקציה");
    } else {
      toast.success("אינטראקציה נשמרה!");
      resetForm();
      onActionComplete?.();
    }
  }

  async function handleSaveReminder() {
    if (!reminderTitle.trim() || !reminderDate) {
      toast.error("נא למלא כותרת ותאריך");
      return;
    }
    setSavingReminder(true);
    const result = await createReminder(clientId, reminderTitle.trim(), reminderDate, reminderPriority);
    setSavingReminder(false);
    if (result.error) {
      toast.error("שגיאה בשמירת התזכורת");
    } else {
      toast.success("תזכורת נשמרה!");
      resetForm();
      onActionComplete?.();
    }
  }

  async function handleSaveFlag() {
    if (!flagNotes.trim()) {
      toast.error("נא לפרט את האירוע");
      return;
    }
    setSavingFlag(true);
    const severityLabel = flagSeverity === "Low" ? "נמוך" : flagSeverity === "Medium" ? "בינוני" : "קריטי";
    const notes = `[${severityLabel}] ${flagType}: ${flagNotes}`;
    const result = await createInteractionLog(clientId, logType, "complaint", notes);
    setSavingFlag(false);
    if (result.error) {
      toast.error("שגיאה בשמירת הדיווח");
    } else {
      toast.success("אירוע חריג דווח!");
      resetForm();
      onActionComplete?.();
    }
  }

  return (
    <div className="flex-shrink-0 border-t bg-gray-50">

      {/* ── Expanded form area ──────────────────────────── */}
      {activeAction !== null && (
        <div className="bg-white border-b border-gray-200 px-4 pt-3 pb-4 space-y-2.5">
          <div className="flex justify-between items-center mb-1 border-b pb-2">
            <span className="text-xs font-bold text-gray-800">
              {activeAction === "log" && "תיעוד אינטראקציה"}
              {activeAction === "reminder" && "קביעת תזכורת"}
              {activeAction === "job" && "פתיחת משרה מהירה"}
              {activeAction === "candidates" && "שליחת מועמדים"}
              {activeAction === "flag" && "דיווח אירוע חריג"}
            </span>
            <button type="button" onClick={() => setActiveAction(null)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          {/* --- Log Form --- */}
          {activeAction === "log" && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={logType}
                  onChange={(e) => setLogType(e.target.value as InteractionType)}
                  className="w-full p-2 border border-gray-300 rounded text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {(Object.entries(INTERACTION_TYPES) as [InteractionType, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <select
                  value={logOutcome}
                  onChange={(e) => setLogOutcome(e.target.value as InteractionOutcome)}
                  className="w-full p-2 border border-gray-300 rounded text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {(Object.entries(INTERACTION_OUTCOMES) as [InteractionOutcome, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <Textarea
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                rows={2}
                className="resize-none text-sm"
                placeholder="הערות קצרות (Enter לשמירה)..."
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveLog(); } }}
              />
              <Button size="sm" onClick={handleSaveLog} disabled={savingLog} className="w-full">
                {savingLog ? "שומר..." : "שמור תיעוד"}
              </Button>
            </div>
          )}

          {/* --- Reminder Form --- */}
          {activeAction === "reminder" && (
            <div className="space-y-2.5">
              <div className="flex gap-2">
                {[
                  { label: "היום בערב", days: 0 },
                  { label: "מחר בבוקר", days: 1 },
                  { label: "שבוע הבא", days: 7 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + preset.days);
                      setReminderDate(d.toISOString().split("T")[0]);
                    }}
                    className="px-3 py-1 bg-gray-100 rounded-full text-xs hover:bg-gray-200 transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <Input
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                placeholder="כותרת תזכורת..."
                className="text-sm"
              />
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="text-sm flex-1"
                  dir="ltr"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setReminderPriority("normal")}
                    className={`text-xs rounded-md border px-3 py-1.5 font-medium transition-colors ${
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
                    className={`text-xs rounded-md border px-3 py-1.5 font-medium transition-colors ${
                      reminderPriority === "high"
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-600 border-gray-200"
                    }`}
                  >
                    {REMINDER_PRIORITIES.high}
                  </button>
                </div>
              </div>
              <Button size="sm" onClick={handleSaveReminder} disabled={savingReminder} className="w-full">
                {savingReminder ? "שומר..." : "קבע תזכורת"}
              </Button>
            </div>
          )}

          {/* --- Job Form (placeholder) --- */}
          {activeAction === "job" && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-4 gap-2">
                <Input placeholder="תפקיד (למשל: טבח)" className="col-span-2 text-sm" autoFocus
                  value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                <Input placeholder="שכר (₪)" className="col-span-1 text-sm"
                  value={jobPay} onChange={(e) => setJobPay(e.target.value)} />
                <Input placeholder="מיקום" className="col-span-1 text-sm"
                  value={jobLocation} onChange={(e) => setJobLocation(e.target.value)} />
              </div>
              <select
                value={jobShift}
                onChange={(e) => setJobShift(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="בוקר">בוקר (07:00 - 15:00)</option>
                <option value="ערב">ערב (15:00 - 23:00)</option>
                <option value="לילה">לילה</option>
                <option value="מתחלפות">משמרות מתחלפות</option>
              </select>
              <div className="flex gap-2">
                <Button size="sm" disabled className="flex-1 opacity-60">שמור משרה (בקרוב)</Button>
                <Button size="sm" variant="outline" disabled className="flex-1 opacity-60 border-dashed">שמור וחפש עובדים</Button>
              </div>
            </div>
          )}

          {/* --- Candidates Form (placeholder) --- */}
          {activeAction === "candidates" && (
            <div className="space-y-2.5">
              <p className="text-sm text-gray-500">מועמדים מוצעים על בסיס היסטוריה:</p>
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="flex justify-between items-center p-2 border rounded bg-gray-50">
                    <div>
                      <div className="font-bold text-sm text-gray-400">---</div>
                      <div className="text-xs text-gray-400">בקרוב</div>
                    </div>
                    <Button size="sm" variant="outline" disabled className="text-xs opacity-60">בחר</Button>
                  </div>
                ))}
              </div>
              <Button size="sm" disabled className="w-full opacity-60">שלח מועמדים שנבחרו (בקרוב)</Button>
            </div>
          )}

          {/* --- Flag Form --- */}
          {activeAction === "flag" && (
            <div className="space-y-2.5">
              <div className="flex gap-2">
                {(["Low", "Medium", "Critical"] as const).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setFlagSeverity(sev)}
                    className={`flex-1 py-1.5 text-sm rounded border font-medium transition-colors ${
                      flagSeverity === sev
                        ? sev === "Critical"
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-gray-800 text-white border-gray-800"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {sev === "Low" ? "נמוך" : sev === "Medium" ? "בינוני" : "קריטי"}
                  </button>
                ))}
              </div>
              <select
                value={flagType}
                onChange={(e) => setFlagType(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="Operational Issue">בעיה תפעולית</option>
                <option value="Payment / Financial">תשלום / כספים</option>
                <option value="Worker Behavior">התנהגות עובד</option>
              </select>
              <Textarea
                value={flagNotes}
                onChange={(e) => setFlagNotes(e.target.value)}
                rows={2}
                className="resize-none text-sm"
                placeholder="פרטי האירוע..."
              />
              <Button
                size="sm"
                onClick={handleSaveFlag}
                disabled={savingFlag}
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                {savingFlag ? "שומר..." : "סמן אירוע חריג"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Quick Action Button Grid (5-col) ───────────── */}
      <div className="grid grid-cols-5 gap-2 px-3 py-3">
        <button
          type="button"
          onClick={() => setActiveAction(activeAction === "log" ? null : "log")}
          className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all h-[68px] ${
            activeAction === "log"
              ? "bg-blue-50 border-blue-500 ring-2 ring-blue-200 shadow-inner"
              : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm"
          }`}
        >
          <MessageCircle className="w-5 h-5 mb-1 text-blue-600" />
          <span className="text-[10px] font-bold text-gray-700">תיעוד</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAction(activeAction === "reminder" ? null : "reminder")}
          className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all h-[68px] ${
            activeAction === "reminder"
              ? "bg-blue-50 border-blue-500 ring-2 ring-blue-200 shadow-inner"
              : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm"
          }`}
        >
          <Bell className="w-5 h-5 mb-1 text-purple-600" />
          <span className="text-[10px] font-bold text-gray-700">תזכורת</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAction(activeAction === "job" ? null : "job")}
          className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all h-[68px] ${
            activeAction === "job"
              ? "bg-blue-50 border-blue-500 ring-2 ring-blue-200 shadow-inner"
              : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm"
          }`}
        >
          <Briefcase className="w-5 h-5 mb-1 text-green-600" />
          <span className="text-[10px] font-bold text-gray-700">משרה</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAction(activeAction === "candidates" ? null : "candidates")}
          className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all h-[68px] ${
            activeAction === "candidates"
              ? "bg-blue-50 border-blue-500 ring-2 ring-blue-200 shadow-inner"
              : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm"
          }`}
        >
          <Users className="w-5 h-5 mb-1 text-indigo-600" />
          <span className="text-[10px] font-bold text-gray-700">מועמדים</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAction(activeAction === "flag" ? null : "flag")}
          className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all h-[68px] ${
            activeAction === "flag"
              ? "bg-red-50 border-red-500 ring-2 ring-red-200 shadow-inner"
              : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm"
          }`}
        >
          <AlertTriangle className="w-5 h-5 mb-1 text-red-600" />
          <span className="text-[10px] font-bold text-gray-700">חריג</span>
        </button>
      </div>
    </div>
  );
}
