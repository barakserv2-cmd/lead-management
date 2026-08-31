"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HEBREW_DAYS } from "@/lib/booking";

interface Win {
  weekday: number;
  start_minute: number;
  end_minute: number;
  slot_minutes: number;
}

const SLOT_OPTIONS = [15, 20, 30, 45, 60];

function toTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function fromTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function AvailabilityClient() {
  const [windows, setWindows] = useState<Win[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/booking/availability")
      .then((r) => r.json())
      .then((d) => setWindows(d.windows ?? []))
      .catch(() => setWindows([]));
  }, []);

  function update(i: number, patch: Partial<Win>) {
    setWindows((ws) => (ws ? ws.map((w, j) => (j === i ? { ...w, ...patch } : w)) : ws));
  }

  function addWindow() {
    setWindows((ws) => [
      ...(ws ?? []),
      { weekday: 0, start_minute: 600, end_minute: 780, slot_minutes: 20 },
    ]);
  }

  function remove(i: number) {
    setWindows((ws) => (ws ? ws.filter((_, j) => j !== i) : ws));
  }

  async function save() {
    if (!windows || saving) return;
    for (const w of windows) {
      if (w.end_minute <= w.start_minute) {
        toast.error(`חלון ביום ${HEBREW_DAYS[w.weekday]}: שעת הסיום חייבת להיות אחרי ההתחלה`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/booking/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windows }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error ?? "השמירה נכשלה");
        return;
      }
      toast.success("הזמינות נשמרה");
    } finally {
      setSaving(false);
    }
  }

  if (windows === null) {
    return <p className="text-sm text-gray-400">טוען...</p>;
  }

  return (
    <div className="space-y-4">
      {windows.length === 0 && (
        <p className="text-sm text-gray-500 bg-gray-50 border rounded-lg px-4 py-3">
          אין עדיין חלונות. הוסיפי חלון ראשון — למשל: ראשון–חמישי 10:00–13:00,
          ראיון כל 20 דקות.
        </p>
      )}

      <div className="space-y-2">
        {windows.map((w, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 bg-white border rounded-lg px-3 py-2.5"
          >
            <select
              value={w.weekday}
              onChange={(e) => update(i, { weekday: Number(e.target.value) })}
              className="border rounded-md px-2 py-1.5 text-sm"
            >
              {HEBREW_DAYS.map((d, idx) => (
                <option key={idx} value={idx}>
                  יום {d}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={toTime(w.start_minute)}
              onChange={(e) => update(i, { start_minute: fromTime(e.target.value) })}
              className="border rounded-md px-2 py-1 text-sm"
              dir="ltr"
            />
            <span className="text-gray-400 text-sm">עד</span>
            <input
              type="time"
              value={toTime(w.end_minute)}
              onChange={(e) => update(i, { end_minute: fromTime(e.target.value) })}
              className="border rounded-md px-2 py-1 text-sm"
              dir="ltr"
            />
            <select
              value={w.slot_minutes}
              onChange={(e) => update(i, { slot_minutes: Number(e.target.value) })}
              className="border rounded-md px-2 py-1.5 text-sm"
            >
              {SLOT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  כל {s} דק׳
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(i)}
              className="ms-auto text-red-500 hover:text-red-700 text-sm font-medium"
            >
              הסרה
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addWindow}>
          + הוספת חלון
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "שומר..." : "שמירת הזמינות"}
        </Button>
      </div>
    </div>
  );
}
