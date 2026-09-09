"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

export interface EscalationRow {
  id: string;
  name: string | null;
  phone: string | null;
  reason: string | null;
  raised_at: string | null;
}

function whenLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function EscalationsView({ rows }: { rows: EscalationRow[] }) {
  const [items, setItems] = useState(rows);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, action: "release" | "takeover") {
    setBusy(id + action);
    try {
      const res = await fetch(`/api/leads/${id}/escalation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "הפעולה נכשלה");
        return;
      }
      setItems((prev) => prev.filter((r) => r.id !== id));
      toast.success(action === "release" ? "שוחרר — גובגט ממשיך את השיחה" : "קיבלת שליטה — גובגט מוקפא");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-center text-gray-400 py-16 bg-white border border-gray-200 rounded-xl">
        אין כרגע אסקלציות פתוחות — גובגט מטפל בהכול 🎉
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((r) => (
        <div
          key={r.id}
          className="bg-white border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold bg-red-100 text-red-700 rounded-full px-2 py-0.5">🔴 דורש התערבות</span>
              <Link href={`/leads/${r.id}`} className="font-semibold text-gray-900 hover:text-blue-700 hover:underline">
                {r.name || "ללא שם"}
              </Link>
              {r.phone && (
                <a href={`tel:${r.phone}`} className="text-sm text-gray-500 tabular-nums" dir="ltr">
                  {r.phone}
                </a>
              )}
              {r.raised_at && <span className="text-xs text-gray-400">· {whenLabel(r.raised_at)}</span>}
            </div>
            <p className="mt-1 text-sm text-gray-700">{r.reason || "השיחה הועברה למגייס/ת"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => act(r.id, "takeover")}
              disabled={busy !== null}
              className="px-3 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === r.id + "takeover" ? "..." : "קח שליטה"}
            </button>
            <button
              type="button"
              onClick={() => act(r.id, "release")}
              disabled={busy !== null}
              className="px-3 py-2 text-sm font-semibold rounded-lg bg-[#0875E1] text-white hover:bg-[#0a5fb4] disabled:opacity-50"
            >
              {busy === r.id + "release" ? "..." : "אפשר לגובגט להמשיך"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
