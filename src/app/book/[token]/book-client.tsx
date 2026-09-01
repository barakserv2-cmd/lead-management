"use client";

// עמוד תיאום הראיון של המועמד — מובייל-first, בלי התחברות.
// כל התאריכים מגיעים בקונבנציית שעון-הקיר של המערכת ומפורמטים
// עם שדות UTC בלבד (formatSlot) — אף פעם לא לפי אזור הזמן של הדפדפן.

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatSlot } from "@/lib/booking";

type State = "loading" | "open" | "booked" | "expired" | "error";

interface TokenInfo {
  state: "open" | "booked" | "expired";
  firstName?: string;
  interviewType?: "phone" | "in_person" | "video";
  bookedStart?: string | null;
  slots?: string[];
}

const TYPE_LABELS: Record<string, string> = {
  phone: "ראיון טלפוני",
  in_person: "ראיון פרונטלי",
  video: "ראיון וידאו",
};

export function BookClient({ token }: { token: string }) {
  const [state, setState] = useState<State>("loading");
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [justBooked, setJustBooked] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/booking/${token}`, { cache: "no-store" });
      const d = (await res.json()) as TokenInfo;
      setInfo(d);
      setState(d.state === "expired" ? "expired" : d.state);
    } catch {
      setState("error");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const slotsByDay = useMemo(() => {
    const groups: { key: string; dayName: string; date: string; slots: string[] }[] = [];
    for (const s of info?.slots ?? []) {
      const f = formatSlot(s);
      const key = s.slice(0, 10);
      const g = groups.find((x) => x.key === key);
      if (g) g.slots.push(s);
      else groups.push({ key, dayName: f.dayName, date: f.date, slots: [s] });
    }
    return groups;
  }, [info?.slots]);

  async function confirm() {
    if (!selected || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/booking/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt: selected }),
      });
      const d = await res.json();
      if (!res.ok) {
        setNotice(d.error ?? "משהו השתבש — נסו שוב");
        if (Array.isArray(d.slots)) {
          setInfo((prev) => (prev ? { ...prev, slots: d.slots } : prev));
          setSelected(null);
        }
        return;
      }
      setJustBooked(true);
      setRescheduling(false);
      setInfo((prev) =>
        prev ? { ...prev, state: "booked", bookedStart: d.bookedStart } : prev
      );
      setState("booked");
    } catch {
      setNotice("שגיאת רשת — נסו שוב");
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking() {
    if (busy) return;
    if (!window.confirm("לבטל את הראיון? אפשר יהיה לקבוע מועד חדש באותו קישור.")) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/booking/${token}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setNotice(d.error ?? "הביטול נכשל — נסו שוב");
        return;
      }
      setJustBooked(false);
      setSelected(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const typeLabel = TYPE_LABELS[info?.interviewType ?? "phone"] ?? "ראיון";

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-cyan-600 flex items-center justify-center text-white text-xl font-bold">
            ב
          </div>
          <h1 className="text-xl font-bold text-gray-900">ברק שירותים</h1>
          <p className="text-sm text-gray-500">תיאום ראיון</p>
        </div>

        {state === "loading" && (
          <p className="text-center text-gray-500 text-sm py-10">טוען...</p>
        )}

        {(state === "expired" || state === "error") && (
          <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
            <p className="font-semibold text-gray-800 mb-1">
              {state === "expired" ? "הקישור כבר לא בתוקף" : "משהו השתבש"}
            </p>
            <p className="text-sm text-gray-500">
              {state === "expired"
                ? "פנו לרכזת שלכם בוואטסאפ ונשלח לכם קישור חדש."
                : "רעננו את הדף או נסו שוב מאוחר יותר."}
            </p>
          </div>
        )}

        {state === "booked" && info?.bookedStart && !rescheduling && (
          <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-6 h-6 text-green-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-bold text-gray-900 text-lg mb-1">
              {justBooked ? "הראיון נקבע!" : "יש לך ראיון קבוע"}
            </p>
            {(() => {
              const f = formatSlot(info.bookedStart!);
              return (
                <p className="text-gray-700 mb-1">
                  יום {f.dayName} {f.date} בשעה <b>{f.time}</b>
                </p>
              );
            })()}
            <p className="text-sm text-gray-500 mb-5">{typeLabel}</p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  setRescheduling(true);
                  setSelected(null);
                  setNotice(null);
                  load();
                }}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                שינוי מועד
              </button>
              <button
                type="button"
                onClick={cancelBooking}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                {busy ? "מבטל..." : "ביטול הראיון"}
              </button>
            </div>
          </div>
        )}

        {(state === "open" || rescheduling) && state !== "loading" && state !== "expired" && state !== "error" && (
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <p className="font-semibold text-gray-900 mb-1">
              {info?.firstName ? `היי ${info.firstName}! ` : ""}בחר/י מועד ל{typeLabel}
            </p>
            <p className="text-xs text-gray-500 mb-4">
              לחיצה על שעה ואז אישור — וזהו, הראיון קבוע.
            </p>

            {notice && (
              <p className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {notice}
              </p>
            )}

            {slotsByDay.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                אין כרגע מועדים פנויים — פנו לרכזת בוואטסאפ.
              </p>
            ) : (
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pe-1">
                {slotsByDay.map((day) => (
                  <div key={day.key}>
                    <p className="text-xs font-semibold text-gray-500 mb-2">
                      יום {day.dayName} · {day.date}
                    </p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {day.slots.map((s) => {
                        const f = formatSlot(s);
                        const active = selected === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSelected(s)}
                            className={`py-2 rounded-lg border text-sm font-medium tabular-nums transition-colors ${
                              active
                                ? "bg-cyan-600 border-cyan-600 text-white"
                                : "bg-white border-gray-200 text-gray-800 hover:border-cyan-400"
                            }`}
                          >
                            {f.time}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selected && (
              <div className="mt-5 border-t pt-4">
                {(() => {
                  const f = formatSlot(selected);
                  return (
                    <p className="text-sm text-gray-700 mb-3 text-center">
                      נבחר: יום {f.dayName} {f.date} בשעה <b>{f.time}</b>
                    </p>
                  );
                })()}
                <button
                  type="button"
                  onClick={confirm}
                  disabled={busy}
                  className="w-full py-3 rounded-lg bg-cyan-600 text-white font-semibold hover:bg-cyan-700 disabled:opacity-60"
                >
                  {busy ? "קובע..." : "אישור המועד"}
                </button>
              </div>
            )}

            {rescheduling && (
              <button
                type="button"
                onClick={() => setRescheduling(false)}
                className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                חזרה בלי לשנות
              </button>
            )}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6">
          ברק שירותים · השמה לעבודה באילת
        </p>
      </div>
    </div>
  );
}
