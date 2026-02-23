"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Recipient {
  name: string;
  phone: string;
}

interface BulkWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: Recipient[];
  onSuccess: () => void;
}

export function BulkWhatsAppDialog({
  open,
  onOpenChange,
  recipients,
  onSuccess,
}: BulkWhatsAppDialogProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim()) {
      toast.error("יש להזין הודעה");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, message: message.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(`שגיאה: ${data.error || "Unknown error"}`);
      } else {
        toast.success(`נשלחו ${data.sent} הודעות WhatsApp בהצלחה!`);
        setMessage("");
        onOpenChange(false);
        onSuccess();
      }
    } catch (err) {
      toast.error(
        `שגיאה: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
    setSending(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>שליחת WhatsApp המונית</DialogTitle>
          <DialogDescription>
            שליחה ל-{recipients.length} נמענים שנבחרו
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wa-message">הודעה</Label>
            <textarea
              id="wa-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              placeholder="שלום {name}, ..."
              dir="rtl"
            />
            <p className="text-xs text-gray-500">
              ניתן להשתמש ב-<code className="bg-gray-100 px-1 rounded">{"{name}"}</code> כדי להציב את שם הליד באופן אוטומטי.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ביטול
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {sending ? "שולח..." : "שלח WhatsApp"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
