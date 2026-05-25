"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LEAD_SOURCES } from "@/lib/constants";
import { ALL_STATUSES, STATUS_LABELS, LeadStatus } from "@/lib/stateMachine";

export function AddLeadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = (form.get("name") as string).trim();

    if (!name) {
      toast.error("שם הוא שדה חובה");
      return;
    }

    setSubmitting(true);
    try {
      // Plain fetch (NOT a server action) so Next.js 16's implicit RSC
      // refresh of /leads can't reject this promise with an opaque
      // "Server Components render" error after a successful insert.
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone: (form.get("phone") as string).trim(),
          job_title: (form.get("job_title") as string).trim(),
          source: form.get("source") as string,
          status: form.get("status") as string,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        toast.error(`שגיאה ביצירת ליד: ${data.error ?? res.statusText}`);
      } else {
        toast.success("ליד נוסף בהצלחה!");
        setOpen(false);
        // router.refresh() is fire-and-forget — failures inside the new
        // RSC payload surface as a console warning, not a thrown error,
        // so the user still sees the success toast even if the list
        // doesn't auto-update.
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שמירה נכשלה: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ הוסף ליד</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>הוסף ליד</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">שם *</Label>
            <Input id="name" name="name" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">טלפון</Label>
            <Input id="phone" name="phone" dir="ltr" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="job_title">תפקיד</Label>
            <Input id="job_title" name="job_title" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">מקור</Label>
            <select
              id="source"
              name="source"
              defaultValue="אחר"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">סטטוס</Label>
            <select
              id="status"
              name="status"
              defaultValue={LeadStatus.NEW_LEAD}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "שומר..." : "הוסף ליד"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
