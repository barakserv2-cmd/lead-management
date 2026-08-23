"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Lead } from "@/types/leads";
import { validateInterviewLocal } from "@/lib/interviewTime";

// "מידע גיוס" בכרטיס המלא — תצוגה + מצב עריכה inline.
// שמירה דרך PATCH /api/leads/[id] (fetch+API, לא server action — הדפוס בפרויקט).

type Form = {
  screening_score: string;
  interview_date: string; // datetime-local value
  interview_notes: string;
  hired_client: string;
  hired_position: string;
  rejection_reason: string;
  start_date: string;
  arrival_date: string;
};

type Values = Pick<
  Lead,
  | "screening_score"
  | "interview_date"
  | "interview_notes"
  | "hired_client"
  | "hired_position"
  | "rejection_reason"
  | "start_date"
  | "arrival_date"
>;

const pad = (n: number) => String(n).padStart(2, "0");

// ISO → ערך ל-datetime-local בשעון המקומי של הדפדפן (ישראל)
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(d: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(d: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pick(lead: Lead): Values {
  return {
    screening_score: lead.screening_score,
    interview_date: lead.interview_date,
    interview_notes: lead.interview_notes,
    hired_client: lead.hired_client,
    hired_position: lead.hired_position,
    rejection_reason: lead.rejection_reason,
    start_date: lead.start_date,
    arrival_date: lead.arrival_date,
  };
}

function toForm(v: Values): Form {
  return {
    screening_score: v.screening_score != null ? String(v.screening_score) : "",
    interview_date: toLocalInput(v.interview_date),
    interview_notes: v.interview_notes ?? "",
    hired_client: v.hired_client ?? "",
    hired_position: v.hired_position ?? "",
    rejection_reason: v.rejection_reason ?? "",
    start_date: v.start_date ?? "",
    arrival_date: v.arrival_date ?? "",
  };
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm font-medium text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-left" dir="auto">{value || "—"}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <label className="text-sm font-medium text-gray-500 shrink-0">{label}</label>
      <div className="w-[60%]">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white";

export function RecruitmentInfoSection({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => pick(lead));
  const [form, setForm] = useState<Form>(() => toForm(pick(lead)));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // כרטיס של ליד אחר / נתונים שהתרעננו מהשרת — לאפס
  useEffect(() => {
    const v = pick(lead);
    setValues(v);
    setForm(toForm(v));
    setEditing(false);
  }, [lead]);

  function set<K extends keyof Form>(key: K, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function save() {
    const timeError = validateInterviewLocal(form.interview_date);
    if (timeError) { toast.error(timeError); return; }
    setSaving(true);
    try {
      const payload = {
        screening_score: form.screening_score.trim(),
        // datetime-local → ISO לפי שעון הדפדפן, כדי שהשרת (UTC) לא יזיז את השעה
        interview_date: form.interview_date ? new Date(form.interview_date).toISOString() : "",
        interview_notes: form.interview_notes,
        hired_client: form.hired_client,
        hired_position: form.hired_position,
        rejection_reason: form.rejection_reason,
        start_date: form.start_date,
        arrival_date: form.arrival_date,
      };
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; lead?: Partial<Lead> };
      if (!res.ok) {
        toast.error(data.error ?? "שגיאה בשמירה");
        return;
      }
      const next: Values = { ...values, ...(data.lead as Values) };
      setValues(next);
      setForm(toForm(next));
      setEditing(false);
      toast.success("מידע הגיוס נשמר");
      router.refresh();
    } catch {
      toast.error("שגיאת רשת בשמירה");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setForm(toForm(values));
    setEditing(false);
  }

  return (
    <div className="px-6 pb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">מידע גיוס</h3>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-cyan-700 transition-colors"
            title="ערוך מידע גיוס"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
            </svg>
            עריכה
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-3 py-1 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "שומר..." : "שמור"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="px-3 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors"
            >
              ביטול
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border p-3">
        {!editing ? (
          <>
            <Row label="ציון סינון" value={values.screening_score?.toString()} />
            <Row label="תאריך ראיון" value={formatDateTime(values.interview_date)} />
            <Row label="הערות ראיון" value={values.interview_notes} />
            <Row label="לקוח" value={values.hired_client} />
            <Row label="תפקיד שהתקבל" value={values.hired_position} />
            <Row label="סיבת דחייה" value={values.rejection_reason} />
            <Row label="תאריך התחלה" value={formatDate(values.start_date)} />
            <Row label="תאריך הגעה" value={formatDate(values.arrival_date)} />
          </>
        ) : (
          <>
            <Field label="ציון סינון">
              <input type="number" min={0} max={100} value={form.screening_score} onChange={(e) => set("screening_score", e.target.value)} className={inputCls} dir="ltr" placeholder="0–100" />
            </Field>
            <Field label="תאריך ראיון">
              <input type="datetime-local" step={300} value={form.interview_date} onChange={(e) => set("interview_date", e.target.value)} className={inputCls} dir="ltr" />
              {validateInterviewLocal(form.interview_date) && <p className="mt-1 text-xs text-red-600">{validateInterviewLocal(form.interview_date)}</p>}
            </Field>
            <Field label="הערות ראיון">
              <textarea rows={2} value={form.interview_notes} onChange={(e) => set("interview_notes", e.target.value)} className={`${inputCls} resize-none`} />
            </Field>
            <Field label="לקוח">
              <input type="text" value={form.hired_client} onChange={(e) => set("hired_client", e.target.value)} className={inputCls} placeholder="שם המעסיק" />
            </Field>
            <Field label="תפקיד שהתקבל">
              <input type="text" value={form.hired_position} onChange={(e) => set("hired_position", e.target.value)} className={inputCls} />
            </Field>
            <Field label="סיבת דחייה">
              <input type="text" value={form.rejection_reason} onChange={(e) => set("rejection_reason", e.target.value)} className={inputCls} />
            </Field>
            <Field label="תאריך התחלה">
              <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputCls} dir="ltr" />
            </Field>
            <Field label="תאריך הגעה">
              <input type="date" value={form.arrival_date} onChange={(e) => set("arrival_date", e.target.value)} className={inputCls} dir="ltr" />
            </Field>
          </>
        )}
      </div>
    </div>
  );
}
