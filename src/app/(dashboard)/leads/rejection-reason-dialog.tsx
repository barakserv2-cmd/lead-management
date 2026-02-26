"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { REJECTION_REASONS } from "@/lib/constants";

interface RejectionReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}

export function RejectionReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
}: RejectionReasonDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);

  function handleOpenChange(value: boolean) {
    if (!value) setSelected(null);
    onOpenChange(value);
  }

  function handleConfirm() {
    if (selected) onConfirm(selected);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>סיבת דחייה</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2">
          {REJECTION_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => setSelected(reason)}
              className={`w-full text-right px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                selected === reason
                  ? "border-red-400 bg-red-50 text-red-700 font-medium"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {reason}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            ביטול
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selected || loading}
            className="bg-red-600 hover:bg-red-700"
          >
            {loading ? "שומר..." : "אישור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
