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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface InterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (date: string, notes: string) => void;
  loading?: boolean;
}

export function InterviewDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
}: InterviewDialogProps) {
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  function handleOpenChange(value: boolean) {
    if (!value) {
      setDate("");
      setNotes("");
    }
    onOpenChange(value);
  }

  function handleConfirm() {
    if (date) {
      onConfirm(date, notes);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>תיאום ראיון במשרד</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="interview-date">תאריך ושעה *</Label>
            <input
              id="interview-date"
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-notes">הערות הגעה</Label>
            <Textarea
              id="interview-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="קומה 3, לשאול את השומר..."
              rows={3}
              className="resize-none text-sm"
            />
          </div>
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
            disabled={!date || loading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading ? "שומר..." : "אישור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
