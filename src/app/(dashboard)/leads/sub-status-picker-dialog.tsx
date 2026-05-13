"use client";

import { useState } from "react";

export interface SubStatusPickerConfig {
  title: string;
  subtitle: string;
  options: string[];
  accent: "cyan" | "stone"; // theme color
  /** Mark one option with a hint (e.g. auto-transition). */
  hint?: { option: string; text: string };
}

interface SubStatusPickerDialogProps {
  open: boolean;
  config: SubStatusPickerConfig | null;
  onConfirm: (subStatus: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

const THEME: Record<SubStatusPickerConfig["accent"], {
  ring: string;
  border: string;
  bgSelected: string;
  textSelected: string;
  borderHover: string;
  iconBg: string;
  iconText: string;
  primaryBg: string;
  primaryHover: string;
}> = {
  cyan: {
    ring: "ring-cyan-200",
    border: "border-cyan-300",
    bgSelected: "bg-cyan-50",
    textSelected: "text-cyan-900",
    borderHover: "hover:border-cyan-300 hover:bg-cyan-50/30",
    iconBg: "bg-cyan-100",
    iconText: "text-cyan-600",
    primaryBg: "bg-cyan-600",
    primaryHover: "hover:bg-cyan-700",
  },
  stone: {
    ring: "ring-stone-200",
    border: "border-stone-300",
    bgSelected: "bg-stone-50",
    textSelected: "text-stone-900",
    borderHover: "hover:border-stone-300 hover:bg-stone-50/30",
    iconBg: "bg-stone-100",
    iconText: "text-stone-600",
    primaryBg: "bg-stone-600",
    primaryHover: "hover:bg-stone-700",
  },
};

export function SubStatusPickerDialog({
  open,
  config,
  onConfirm,
  onCancel,
  loading,
}: SubStatusPickerDialogProps) {
  const [subStatus, setSubStatus] = useState("");

  if (!open || !config) return null;

  const theme = THEME[config.accent];

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
          <div className={`w-10 h-10 rounded-full ${theme.iconBg} flex items-center justify-center flex-shrink-0`}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-5 h-5 ${theme.iconText}`}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{config.title}</h3>
            <p className="text-sm text-gray-500">{config.subtitle}</p>
          </div>
        </div>

        <div className="space-y-2 mb-5">
          {config.options.map((opt) => {
            const selected = subStatus === opt;
            const hint = config.hint?.option === opt ? config.hint.text : null;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setSubStatus(opt)}
                className={`w-full text-right px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  selected
                    ? `${theme.bgSelected} ${theme.border} ${theme.textSelected} ring-2 ${theme.ring}`
                    : `bg-white border-gray-200 text-gray-700 ${theme.borderHover}`
                }`}
              >
                <span className="flex items-center justify-between">
                  <span>{opt}</span>
                  {hint && (
                    <span className="text-[10px] text-rose-600 font-semibold">{hint}</span>
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
            className={`flex-1 px-4 py-2.5 ${theme.primaryBg} text-white text-sm font-semibold rounded-lg ${theme.primaryHover} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
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
