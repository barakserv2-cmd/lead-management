"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { getOpenJobs } from "./actions";
import { JobSearchSelect, type JobSearchOption } from "./job-search-select";
import { validateInterviewLocal } from "@/lib/interviewTime";

interface JobRow {
  id: string;
  title: string;
  pay_rate: string | null;
  urgent: boolean;
  clients: { name: string } | null;
}

function todayIsrael(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

// "נשלח לראיון" — המועמד במשרד ויוצא להתראיין אצל מעסיק. שני השדות חובה:
// לאיזו משרה, ובאיזו שעה. בלעדיהם השלב הזה לא ניתן למעקב.
export function SentToInterviewDialog({
  leadId,
  leadName,
  onDone,
  onCancel,
}: {
  leadId: string;
  leadName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobId, setJobId] = useState("");
  const [when, setWhen] = useState(() => `${todayIsrael()}T10:00`);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOpenJobs().then((res) => {
      if (cancelled) return;
      setJobs((res.jobs as unknown as JobRow[]) ?? []);
      setJobsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const options = useMemo<JobSearchOption[]>(
    () =>
      jobs.map((j) => ({
        id: j.id,
        title: j.title,
        clientName: j.clients?.name ?? "ללא מעסיק",
        payRate: j.pay_rate,
        urgent: j.urgent,
      })),
    [jobs]
  );

  const timeError = validateInterviewLocal(when);
  const otherDay = when.slice(0, 10) !== todayIsrael();
  const canSave = !!jobId && !!when && !timeError && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/sent-to-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, when }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; reminderAt?: string | null };
      if (!res.ok) {
        toast.error(data.error ?? "השמירה נכשלה");
        return;
      }
      toast.success(
        data.reminderAt
          ? "נשמר — תזכורת תופיע שעה לפני הראיון"
          : "נשמר"
      );
      onDone();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => !saving && onCancel()} />

      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-indigo-600">
              <path d="M3 21h18" />
              <path d="M5 21V7l8-4v18" />
              <path d="M19 21V11l-6-4" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 truncate">נשלח לראיון — {leadName}</h3>
            <p className="text-sm text-gray-500">לאיזו משרה, ובאיזו שעה</p>
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          משרה <span className="text-red-500">*</span>
        </label>
        <JobSearchSelect jobs={options} value={jobId} onChange={setJobId} loading={jobsLoading} />

        <label className="block text-sm font-medium text-gray-700 mb-1 mt-4">
          מועד הראיון אצל המעסיק <span className="text-red-500">*</span>
        </label>
        <input
          type="datetime-local"
          step={300}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
            timeError ? "border-red-400" : "border-gray-300"
          }`}
          dir="ltr"
        />
        <p className={`mt-1 text-xs ${timeError ? "text-red-600" : "text-gray-500"}`}>
          {timeError ??
            (otherDay
              ? "🔔 הראיון ביום אחר — תיפתח תזכורת שעה לפניו"
              : "הראיון היום — לא נפתחת תזכורת")}
        </p>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "שומר..." : "שמור"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
