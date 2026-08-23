"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Reminder {
  id: string;
  send_at: string;
  message: string;
  created_by: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  sent_at: string | null;
  error: string | null;
}

const TEMPLATES: { label: string; text: (name: string) => string }[] = [
  {
    label: "תזכורת ראיון",
    text: (n) => `היי ${n}, רק מזכיר/ה שיש לך ראיון מחר. נשמח לראות אותך! 🙂`,
  },
  {
    label: "מעקב — לא ענה",
    text: (n) => `היי ${n}, ראיתי שלא הספקנו לדבר. עדיין רלוונטי לך לעבוד באילת? אשמח לעדכן אותך על המשרות הפתוחות.`,
  },
  {
    label: "תזכורת תחילת עבודה",
    text: (n) => `היי ${n}, מזכיר/ה שמחר מתחילים! אם יש שאלות לפני — אני כאן.`,
  },
  {
    label: "בוקר הראיון",
    text: (n) => `בוקר טוב ${n}! נתראה היום בראיון. בהצלחה 🎯`,
  },
];

/** "2026-08-24T09:00" local for <input type=datetime-local> */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<Reminder["status"], string> = {
  pending: "ממתין",
  sent: "נשלח",
  failed: "נכשל",
  cancelled: "בוטל",
};

export function ReminderDialog({
  leadId,
  leadName,
  interviewDate,
  variant = "chat",
}: {
  leadId: string;
  leadName: string;
  interviewDate?: string | null;
  /** "header": amber button for the lead header; "icon": small bell for dark mini-window bars */
  variant?: "chat" | "header" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [canSend, setCanSend] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [when, setWhen] = useState("");
  const [text, setText] = useState("");

  const firstName = (leadName || "").split(" ")[0] || "";

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/reminders`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setReminders(data.reminders ?? []);
        setCanSend(data.canSend !== false);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  useEffect(() => {
    if (!open) return;
    load();
    // default: tomorrow 09:00, or the morning of the interview if set
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    setWhen(toLocalInput(d));
    setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function useInterviewMorning() {
    if (!interviewDate) return;
    // interview_date is Israel wall-clock labeled UTC → read the UTC fields
    const iv = new Date(interviewDate);
    const d = new Date(iv.getUTCFullYear(), iv.getUTCMonth(), iv.getUTCDate(), 8, 0, 0, 0);
    setWhen(toLocalInput(d));
    setText(TEMPLATES[3].text(firstName));
  }

  function useDayBeforeInterview() {
    if (!interviewDate) return;
    const iv = new Date(interviewDate);
    const d = new Date(iv.getUTCFullYear(), iv.getUTCMonth(), iv.getUTCDate() - 1, 18, 0, 0, 0);
    setWhen(toLocalInput(d));
    setText(TEMPLATES[0].text(firstName));
  }

  async function schedule() {
    if (!when || !text.trim()) {
      toast.error("צריך גם זמן וגם טקסט");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendAt: new Date(when).toISOString(), message: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "קביעת התזכורת נכשלה");
      } else {
        toast.success(`תזכורת נקבעה ל-${fmt(data.reminder.send_at)}`);
        setText("");
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    const res = await fetch(`/api/reminders/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) toast.error(data.error ?? "הביטול נכשל");
    else {
      toast.success("התזכורת בוטלה");
      await load();
    }
  }

  const pendingCount = reminders.filter((r) => r.status === "pending").length;

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className="relative p-1 rounded hover:bg-white/20 transition-colors"
          title="קבע תזכורת"
        >
          <Bell className="w-3.5 h-3.5 text-amber-300" />
          {pendingCount > 0 && (
            <span className="absolute -top-0.5 -left-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-amber-400 text-[9px] font-bold text-gray-900 flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>
      ) : variant === "header" ? (
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white h-7 px-2.5 text-xs gap-1"
          title="קבע הודעת תזכורת אוטומטית למועמד"
        >
          <Bell className="w-3.5 h-3.5" />
          <span className="mr-1">קבע תזכורת</span>
          {pendingCount > 0 && (
            <span className="text-[10px] bg-white/30 rounded-full px-1.5">{pendingCount}</span>
          )}
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
          title="קבע הודעת תזכורת אוטומטית למועמד"
        >
          <Bell className="w-4 h-4" />
          קבע תזכורת
          {pendingCount > 0 && (
            <span className="text-[10px] bg-white/30 rounded-full px-1.5">{pendingCount}</span>
          )}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>תזכורת ל{leadName ? `-${leadName}` : "מועמד"}</DialogTitle>
            <DialogDescription>
              ההודעה תישלח אוטומטית בוואטסאפ בזמן שתבחר, מהמספר שלך, ותופיע בצ&apos;אט.
            </DialogDescription>
          </DialogHeader>

          {!canSend ? (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-md p-3">
              אין לך מספר וואטסאפ מחובר, אז אי אפשר לקבוע תזכורות. חבר מספר בהגדרות ← הוואטסאפ שלי.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="rem-when">מתי לשלוח</Label>
                <Input
                  id="rem-when"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  dir="ltr"
                />
                {interviewDate && (
                  <div className="flex gap-2 text-xs">
                    <button type="button" onClick={useDayBeforeInterview} className="text-blue-600 hover:underline">
                      ערב לפני הראיון (18:00)
                    </button>
                    <span className="text-gray-300">·</span>
                    <button type="button" onClick={useInterviewMorning} className="text-blue-600 hover:underline">
                      בוקר הראיון (08:00)
                    </button>
                  </div>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="rem-text">ההודעה</Label>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => setText(t.text(firstName))}
                      className="text-[11px] px-2 py-0.5 rounded-full border bg-white hover:bg-gray-50 text-gray-600"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  id="rem-text"
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="כתוב את ההודעה שתישלח..."
                  dir="rtl"
                />
              </div>

              <Button onClick={schedule} disabled={saving} className="w-full">
                {saving ? "קובע..." : "קבע תזכורת"}
              </Button>
            </div>
          )}

          {/* Existing reminders */}
          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-gray-500 mb-2">
              תזכורות לליד הזה {loading && <span className="font-normal">(טוען...)</span>}
            </div>
            {reminders.length === 0 ? (
              <p className="text-xs text-gray-400">אין תזכורות עדיין.</p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {reminders.map((r) => (
                  <li
                    key={r.id}
                    className={`flex items-start gap-2 text-xs rounded-md px-2 py-1.5 ${
                      r.status === "pending"
                        ? "bg-amber-50"
                        : r.status === "sent"
                          ? "bg-emerald-50"
                          : "bg-gray-50 text-gray-400"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{fmt(r.send_at)}</span>
                        <span className="text-[10px] opacity-70">{STATUS_LABEL[r.status]}</span>
                        <span className="text-[10px] opacity-60" title={r.created_by}>
                          {r.created_by.split("@")[0]}
                        </span>
                      </div>
                      <p className="truncate" title={r.message}>{r.message}</p>
                      {r.error && <p className="text-red-600">{r.error}</p>}
                    </div>
                    {r.status === "pending" && (
                      <button onClick={() => cancel(r.id)} title="בטל תזכורת" className="text-gray-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
