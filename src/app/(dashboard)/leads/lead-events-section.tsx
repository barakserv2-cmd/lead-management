"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { TimelineEvent } from "@/app/api/leads/[id]/events/route";

// יומן אירועים למועמד: תיעוד של כל מה שקרה עם העובד — שיחות, אזהרות,
// תיאומים, תלונות — ממוזג עם שינויי הסטטוס האוטומטיים. כל רשומה מציגה מי
// כתב אותה (created_by). רשומות ידניות (lead_events) ניתנות לעריכה; שינויי
// סטטוס אוטומטיים לא. המטרה: כשיש מחלוקת, היומן הוא האמת.

const EVENT_TYPES = ["שיחה", "אזהרה", "תיאום", "תלונה", "שיבוץ", "אחר"] as const;

const TYPE_COLORS: Record<string, string> = {
  "שיחה": "bg-cyan-100 text-cyan-700",
  "אזהרה": "bg-amber-100 text-amber-800",
  "תיאום": "bg-blue-100 text-blue-700",
  "תלונה": "bg-red-100 text-red-700",
  "שיבוץ": "bg-green-100 text-green-700",
  "אחר": "bg-gray-100 text-gray-600",
  "שינוי סטטוס": "bg-slate-100 text-slate-500",
  // סוגים שנרשמים אוטומטית מתוך פעולות הרכזת
  "הערה": "bg-violet-100 text-violet-700",
  "דחייה": "bg-red-100 text-red-700",
  "ראיון": "bg-purple-100 text-purple-700",
  "מעקב": "bg-teal-100 text-teal-700",
  "שיחה נכנסת": "bg-cyan-100 text-cyan-700",
  "שיחה יוצאת": "bg-cyan-100 text-cyan-700",
  "וואטסאפ": "bg-green-100 text-green-700",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "2-digit" }) +
    " · " +
    d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function LeadEventsSection({ leadId }: { leadId: string }) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [text, setText] = useState("");
  const [eventType, setEventType] = useState<string>("שיחה");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/events`);
      const data = await res.json();
      if (res.ok) {
        setTimeline(data.timeline ?? []);
        setTableMissing(!!data.eventsTableMissing);
      }
    } catch {
      // רשת נפלה — משאירים את מה שיש
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addEvent() {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: eventType, event_text: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "שגיאה בשמירת האירוע");
      } else {
        setText("");
        toast.success("האירוע נרשם ביומן");
        // מוסיפים אופטימית ומרעננים ברקע
        setTimeline((prev) => [
          { ...data.event, kind: "event", text: data.event.event_text },
          ...prev,
        ]);
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  function startEdit(ev: TimelineEvent) {
    setEditingId(ev.id);
    setEditText(ev.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit(eventId: string) {
    const trimmed = editText.trim();
    if (!trimmed || savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/events`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, event_text: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "שגיאה בעריכת האירוע");
      } else {
        setTimeline((prev) =>
          prev.map((ev) =>
            ev.id === eventId ? { ...ev, text: trimmed } : ev
          )
        );
        cancelEdit();
        toast.success("ההערה עודכנה");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-900 mb-2">יומן אירועים</h3>

      {tableMissing && (
        <div className="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          טבלת האירועים עדיין לא הוקמה בדאטהבייס (מיגרציה 00035) — בינתיים מוצגים רק שינויי סטטוס.
        </div>
      )}

      {/* הוספת אירוע */}
      <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {EVENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setEventType(t)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                eventType === t
                  ? "bg-cyan-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-cyan-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="מה קרה? לדוגמה: העובד לא הגיע למשמרת, סוכם עם המלון על החלפה..."
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none bg-white"
        />
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={addEvent}
            disabled={!text.trim() || saving}
            className="px-4 py-1.5 bg-cyan-600 text-white text-xs font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "שומר..." : "הוסף ליומן"}
          </button>
        </div>
      </div>

      {/* ציר זמן */}
      {loading ? (
        <div className="text-xs text-gray-400 py-3 text-center">טוען יומן...</div>
      ) : timeline.length === 0 ? (
        <div className="text-xs text-gray-400 py-3 text-center">אין אירועים עדיין</div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pl-1">
          {timeline.map((ev) => (
            <div
              key={`${ev.kind}-${ev.id}`}
              className={`p-2.5 rounded-lg border text-xs ${
                ev.kind === "status" ? "bg-slate-50/60 border-slate-100" : "bg-white border-gray-200"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_COLORS[ev.event_type] ?? TYPE_COLORS["אחר"]}`}>
                  {ev.event_type}
                </span>
                <span className="text-[10px] text-gray-400 mr-auto">{formatDateTime(ev.created_at)}</span>
                {ev.editable && editingId !== ev.id && (
                  <button
                    type="button"
                    onClick={() => startEdit(ev)}
                    className="text-[10px] text-cyan-600 hover:text-cyan-700 hover:underline shrink-0"
                  >
                    ערוך
                  </button>
                )}
              </div>

              {editingId === ev.id ? (
                <div className="space-y-1.5">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="w-full px-2 py-1.5 border border-cyan-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none bg-white"
                    autoFocus
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-2.5 py-1 text-[11px] text-gray-500 hover:text-gray-700"
                    >
                      ביטול
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(ev.id)}
                      disabled={!editText.trim() || savingEdit}
                      className="px-3 py-1 bg-cyan-600 text-white text-[11px] font-semibold rounded-md hover:bg-cyan-700 disabled:opacity-50"
                    >
                      {savingEdit ? "שומר..." : "שמור"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={ev.kind === "status" ? "text-gray-500" : "text-gray-800"}>{ev.text}</div>
              )}

              <div className="text-[10px] text-gray-400 mt-1">מאת: {ev.created_by}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
