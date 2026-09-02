"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

interface RuleRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger_type: string;
  action_type: string;
  template: string | null;
  week_ok: number;
  week_failed: number;
  last_run: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  message_candidate: "וואטסאפ למועמד/ת",
  raise_flag: "הרמת דגל",
  notify_recruiter: "תזכורת לרכזת",
  notify_admin: "התראה לסער",
};

function fmt(iso: string | null): string {
  if (!iso) return "טרם רץ";
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AutomationClient() {
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/automation/rules")
      .then((r) => r.json())
      .then((d) => setRules(d.rules ?? []))
      .catch(() => setRules([]));
  }, []);

  async function toggle(rule: RuleRow) {
    if (busy) return;
    const next = !rule.enabled;
    if (
      next &&
      !confirm(
        `להדליק את החוק "${rule.name}"?\n\nמהריצה הבאה (עד 5 דקות) המנוע יתחיל לבצע אותו על לידים אמיתיים.`
      )
    )
      return;
    setBusy(rule.id);
    try {
      const res = await fetch("/api/automation/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error ?? "העדכון נכשל");
        return;
      }
      setRules((rs) => (rs ? rs.map((r) => (r.id === rule.id ? { ...r, enabled: next } : r)) : rs));
      toast.success(next ? "החוק הודלק" : "החוק כובה");
    } finally {
      setBusy(null);
    }
  }

  if (rules === null) return <p className="text-sm text-gray-400">טוען...</p>;

  return (
    <div className="space-y-3">
      {rules.map((r) => (
        <div key={r.id} className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-gray-900">{r.name}</h3>
                <span
                  className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${
                    r.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {r.enabled ? "פעיל" : "כבוי"}
                </span>
                <span className="text-[11px] rounded-full px-2 py-0.5 bg-cyan-50 text-cyan-700">
                  {ACTION_LABELS[r.action_type] ?? r.action_type}
                </span>
              </div>
              {r.description && <p className="text-sm text-gray-500 mt-1">{r.description}</p>}
              {r.template && (
                <p className="text-[13px] text-gray-700 bg-gray-50 border rounded-lg px-3 py-1.5 mt-2 whitespace-pre-line">
                  {r.template}
                </p>
              )}
              <p className="text-[11px] text-gray-400 mt-2 tabular-nums">
                שבוע אחרון: {r.week_ok} בוצעו{r.week_failed > 0 ? ` · ${r.week_failed} נכשלו` : ""} · ריצה
                אחרונה: {fmt(r.last_run)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggle(r)}
              disabled={busy !== null}
              className={`shrink-0 relative w-12 h-7 rounded-full transition-colors ${
                r.enabled ? "bg-green-500" : "bg-gray-300"
              } ${busy === r.id ? "opacity-50" : ""}`}
              aria-label={r.enabled ? "כיבוי החוק" : "הדלקת החוק"}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  r.enabled ? "right-1" : "right-6"
                }`}
              />
            </button>
          </div>
        </div>
      ))}
      {rules.length === 0 && (
        <p className="text-sm text-gray-400 bg-gray-50 border rounded-xl px-4 py-6 text-center">
          אין חוקים — הרץ את מיגרציית הזריעה.
        </p>
      )}
    </div>
  );
}
