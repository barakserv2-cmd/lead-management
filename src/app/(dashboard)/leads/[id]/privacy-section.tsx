"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// ── פאנל פרטיות בכרטיס המועמד ─────────────────────────────
// זכות עיון (הורדת עותק), זכות מחיקה (אנונימיזציה), ותיעוד גישה
// ("מי נגע ברשומה") לפי תקנה 10 לתקנות אבטחת מידע.

type AuditEntry = {
  id: number;
  occurred_at: string;
  actor: string;
  actor_type: string;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  meta: Record<string, unknown> | null;
};

const ACTION_LABELS: Record<string, string> = {
  view: "צפייה",
  list: "רשימה",
  create: "יצירה",
  update: "עדכון פרטים",
  status_change: "שינוי סטטוס",
  note: "הערה",
  export: "ייצוא מידע",
  anonymize: "מחיקת מידע אישי",
  delete: "מחיקה",
  merge: "מיזוג",
  import: "ייבוא",
  login: "כניסה",
};

const FIELD_LABELS: Record<string, string> = {
  name: "שם",
  phone: "טלפון",
  email: "אימייל",
  job_title: "תפקיד",
  location: "מיקום",
  experience: "ניסיון",
  age: "גיל",
  status: "סטטוס",
  sub_status: "תת-סטטוס",
  start_date: "תאריך התחלה",
  hired_client: "מעסיק",
  hired_position: "תפקיד במעסיק",
  interview_date: "מועד ראיון",
  rejection_reason: "סיבת דחייה",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PrivacySection({
  leadId,
  anonymizedAt,
}: {
  leadId: string;
  anonymizedAt?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [busy, setBusy] = useState<"export" | "erase" | null>(null);

  useEffect(() => {
    if (!open || entries) return;
    let alive = true;
    fetch(`/api/leads/${leadId}/audit?limit=100`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setEntries(d.entries ?? []);
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    return () => {
      alive = false;
    };
  }, [open, entries, leadId]);

  async function handleExport() {
    if (busy) return;
    setBusy("export");
    try {
      const res = await fetch(`/api/leads/${leadId}/privacy`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "שגיאה בייצוא");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lead-${leadId.slice(0, 8)}-data-export.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("קובץ המידע ירד — נרשם ביומן הגישה");
      setEntries(null); // refresh log
    } finally {
      setBusy(null);
    }
  }

  async function handleErase() {
    if (busy) return;
    const ok = confirm(
      "למחוק את כל המידע האישי של המועמד/ת?\n\n" +
        "שם, טלפון, אימייל, הערות, הודעות, מסמכים והעדפות יימחקו לצמיתות. " +
        "הרשומה תישאר כשלד סטטיסטי בלבד (סטטוס, מקור, תאריכים).\n\n" +
        "הפעולה אינה הפיכה."
    );
    if (!ok) return;
    const reason = prompt("סיבה (יירשם ביומן):", "בקשת מועמד/ת") ?? "";
    setBusy("erase");
    try {
      const res = await fetch(
        `/api/leads/${leadId}/privacy?reason=${encodeURIComponent(reason.slice(0, 200))}`,
        { method: "DELETE" }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error ?? "שגיאה במחיקה");
        return;
      }
      toast.success("המידע האישי נמחק");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-right"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <ShieldIcon className="w-4 h-4 text-cyan-600" />
          פרטיות ואבטחת מידע
          {anonymizedAt && (
            <span className="text-[11px] font-medium bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
              מידע אישי נמחק {fmtDate(anonymizedAt)}
            </span>
          )}
        </span>
        <span className="text-xs text-gray-400">{open ? "סגור" : "פתח"}</span>
      </button>

      {open && (
        <div className="border-t px-5 py-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={busy !== null}
            >
              {busy === "export" ? "מייצא..." : "הורד עותק של כל המידע (זכות עיון)"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleErase}
              disabled={busy !== null || !!anonymizedAt}
            >
              {busy === "erase" ? "מוחק..." : "מחק מידע אישי (זכות מחיקה)"}
            </Button>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            מחיקה משאירה שלד סטטיסטי בלבד. לידים ללא פעילות 24 חודש (84 למי שהתקבל)
            עוברים אנונימיזציה אוטומטית. כל צפייה, שינוי, ייצוא ומחיקה נרשמים ביומן למשך 24 חודש.
          </p>

          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">יומן גישה לרשומה</h4>
            {entries === null ? (
              <p className="text-xs text-gray-400">טוען...</p>
            ) : entries.length === 0 ? (
              <p className="text-xs text-gray-400">אין רשומות עדיין (היומן התחיל לפעול עם התקנת המיגרציה).</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto divide-y text-xs">
                {entries.map((e) => (
                  <li key={e.id} className="py-1.5 flex gap-3">
                    <span className="text-gray-400 whitespace-nowrap tabular-nums">
                      {fmtDate(e.occurred_at)}
                    </span>
                    <span className="font-medium text-gray-700 whitespace-nowrap">
                      {ACTION_LABELS[e.action] ?? e.action}
                    </span>
                    <span className="text-gray-500 truncate" title={e.actor}>
                      {e.actor}
                    </span>
                    {e.changes && (
                      <span className="text-gray-500 truncate">
                        {Object.entries(e.changes)
                          .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${fmt(v.from)} ← ${fmt(v.to)}`)
                          .join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 12l1.8 1.8L15 10" />
    </svg>
  );
}
