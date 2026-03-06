"use client";

import { useState } from "react";

interface InterviewScheduleDialogProps {
  open: boolean;
  onConfirm: (data: { interviewDate: string; designatedRole: string }) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function InterviewScheduleDialog({
  open,
  onConfirm,
  onCancel,
  loading,
}: InterviewScheduleDialogProps) {
  const [interviewDate, setInterviewDate] = useState("");
  const [designatedRole, setDesignatedRole] = useState("");

  if (!open) return null;

  function handleConfirm() {
    if (!interviewDate) return;
    onConfirm({ interviewDate, designatedRole });
    setInterviewDate("");
    setDesignatedRole("");
  }

  function handleCancel() {
    setInterviewDate("");
    setDesignatedRole("");
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />

      {/* Modal */}
      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-purple-600"
            >
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">קביעת ראיון</h3>
            <p className="text-sm text-gray-500">
              הזן את פרטי הראיון לפני שינוי הסטטוס
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תאריך ושעת ראיון <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={interviewDate}
              onChange={(e) => setInterviewDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תפקיד מיועד
            </label>
            <input
              type="text"
              value={designatedRole}
              onChange={(e) => setDesignatedRole(e.target.value)}
              placeholder="לדוגמה: מנהל מחסן, מפעיל מכונות..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!interviewDate || loading}
            className="flex-1 px-4 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "שומר..." : "אישור וקביעת ראיון"}
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
