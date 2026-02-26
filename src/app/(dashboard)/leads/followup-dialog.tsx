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

interface FollowupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (notes: string) => void;
  loading?: boolean;
}

export function FollowupDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
}: FollowupDialogProps) {
  const [notes, setNotes] = useState("");

  function handleOpenChange(value: boolean) {
    if (!value) {
      setNotes("");
    }
    onOpenChange(value);
  }

  function handleConfirm() {
    if (notes.trim()) {
      onConfirm(notes.trim());
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>סיכום שיחה</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="followup-notes">סיכום שיחה / הערות למעקב *</Label>
            <Textarea
              id="followup-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="על מה דיברתם? מה הסיכום? מה הצעד הבא?"
              rows={5}
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
            disabled={!notes.trim() || loading}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {loading ? "שומר..." : "אישור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
