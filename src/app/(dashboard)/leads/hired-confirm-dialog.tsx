"use client";

import { useState, useEffect } from "react";
import { getActiveClients } from "./actions";

interface HiredConfirmDialogProps {
  open: boolean;
  onConfirm: (data: { hiredClient: string; startDate: string; hiredPosition: string }) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function HiredConfirmDialog({
  open,
  onConfirm,
  onCancel,
  loading,
}: HiredConfirmDialogProps) {
  const [hiredClient, setHiredClient] = useState("");
  const [hiredClientCustom, setHiredClientCustom] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hiredPosition, setHiredPosition] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  // Fetch clients when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setClientsLoading(true);
    getActiveClients().then((res) => {
      if (cancelled) return;
      setClients(res.clients);
      setClientsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  function reset() {
    setHiredClient("");
    setHiredClientCustom("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setHiredPosition("");
  }

  const resolvedClient = hiredClient === "__other__" ? hiredClientCustom.trim() : hiredClient;
  const canSubmit = !!resolvedClient && !!startDate && !loading;

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm({
      hiredClient: resolvedClient,
      startDate,
      hiredPosition: hiredPosition.trim(),
    });
    reset();
  }

  function handleCancel() {
    reset();
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
              באיזה לקוח התקבל ומתי הוא מתחיל?
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              לקוח <span className="text-red-500">*</span>
            </label>
            <select
              value={hiredClient}
              onChange={(e) => setHiredClient(e.target.value)}
              disabled={clientsLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="">{clientsLoading ? "טוען..." : "בחר לקוח..."}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
              <option value="__other__">— אחר (הקלד שם) —</option>
            </select>
            {hiredClient === "__other__" && (
              <input
                type="text"
                value={hiredClientCustom}
                onChange={(e) => setHiredClientCustom(e.target.value)}
                placeholder="שם לקוח חדש"
                className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תפקיד
            </label>
            <input
              type="text"
              value={hiredPosition}
              onChange={(e) => setHiredPosition(e.target.value)}
              placeholder="לדוגמה: מלצר, חדרנית, ברמן..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Actions */}
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
