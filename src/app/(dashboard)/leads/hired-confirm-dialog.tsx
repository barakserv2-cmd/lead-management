"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getOpenJobs } from "./actions";
import { JobSearchSelect, type JobSearchOption } from "./job-search-select";

interface JobOption {
  id: string;
  title: string;
  client_id: string;
  pay_rate: string | null;
  urgent: boolean;
  clients: { name: string } | null;
}

interface HiredConfirmDialogProps {
  open: boolean;
  onConfirm: (data: { hiredJobId: string; startDate: string }) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function HiredConfirmDialog({
  open,
  onConfirm,
  onCancel,
  loading,
}: HiredConfirmDialogProps) {
  const [hiredJobId, setHiredJobId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setJobsLoading(true);
    getOpenJobs().then((res) => {
      if (cancelled) return;
      setJobs((res.jobs as JobOption[]) ?? []);
      setJobsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const options = useMemo<JobSearchOption[]>(
    () =>
      jobs.map((j) => ({
        id: j.id,
        title: j.title,
        clientName: j.clients?.name ?? "ללא לקוח",
        payRate: j.pay_rate,
        urgent: j.urgent,
      })),
    [jobs]
  );

  if (!open) return null;

  const canSubmit = !!hiredJobId && !!startDate && !loading;

  function reset() {
    setHiredJobId("");
    setStartDate(new Date().toISOString().slice(0, 10));
  }

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm({ hiredJobId, startDate });
    reset();
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />

      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6"
        dir="rtl"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-green-600"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">אישור קבלה</h3>
            <p className="text-sm text-gray-500">
              לאיזו משרה הוא התקבל ומתי מתחיל?
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              משרה <span className="text-red-500">*</span>
            </label>
            <JobSearchSelect
              jobs={options}
              value={hiredJobId}
              onChange={setHiredJobId}
              loading={jobsLoading}
              autoFocus
            />
            {!jobsLoading && jobs.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-700">
                אין משרות פתוחות. <Link href="/jobs" className="underline">פתח משרה חדשה</Link> ואז חזור לכאן.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תאריך התחלה <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              dir="ltr"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "שומר..." : "אישור קבלה"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
