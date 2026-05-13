"use client";

import { useState } from "react";
import { SUB_STATUSES } from "@/lib/constants";

interface ContactedSubStatusDialogProps {
  open: boolean;
  onConfirm: (subStatus: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ContactedSubStatusDialog({
  open,
  onConfirm,
  onCancel,
  loading,
}: ContactedSubStatusDialogProps) {
  const [subStatus, setSubStatus] = useState("");

  if (!open) return null;

  const options = SUB_STATUSES["CONTACTED"] ?? [];

  function handleConfirm() {
    if (!subStatus) return;
    onConfirm(subStatus);
    setSubStatus("");
  }

  function handleCancel() {
    setSubStatus("");
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
          <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-cyan-600"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">נוצר קשר — מצב</h3>
            <p className="text-sm text-gray-500">בחר את תוצאת הניסיון</p>
          </div>
        </div>

        <div className="space-y-2 mb-5">
          {options.map((opt) => {
            const selected = subStatus === opt;
            const isAutoLost = opt === "אין מענה 3";
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setSubStatus(opt)}
                className={`w-full text-right px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  selected
                    ? "bg-cyan-50 border-cyan-300 text-cyan-900 ring-2 ring-cyan-200"
                    : "bg-white border-gray-200 text-gray-700 hover:border-cyan-300 hover:bg-cyan-50/30"
                }`}
              >
                <span className="flex items-center justify-between">
                  <span>{opt}</span>
                  {isAutoLost && (
                    <span className="text-[10px] text-rose-600 font-semibold">
                      → אבד קשר אוטומטית
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!subStatus || loading}
            className="flex-1 px-4 py-2.5 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "שומר..." : "אישור"}
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
