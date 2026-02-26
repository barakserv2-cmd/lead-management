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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface HiredDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (client: string, position: string) => void;
  loading?: boolean;
}

export function HiredDetailsDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
}: HiredDetailsDialogProps) {
  const [client, setClient] = useState("");
  const [position, setPosition] = useState("");

  function handleOpenChange(value: boolean) {
    if (!value) {
      setClient("");
      setPosition("");
    }
    onOpenChange(value);
  }

  function handleConfirm() {
    if (client.trim() && position.trim()) {
      onConfirm(client.trim(), position.trim());
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>פרטי קבלה לעבודה</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="hired-client">לקוח *</Label>
            <Input
              id="hired-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="שם הלקוח"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hired-position">משרה *</Label>
            <Input
              id="hired-position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="שם המשרה / תפקיד"
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
            disabled={!client.trim() || !position.trim() || loading}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? "שומר..." : "אישור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
