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
import { LEAD_STATUSES, LEAD_SOURCES } from "@/lib/constants";
import { createLead } from "./actions";

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
    const { error } = await createLead({
      name,
      phone: (form.get("phone") as string).trim(),
      job_title: (form.get("job_title") as string).trim(),
      source: form.get("source") as string,
      status: form.get("status") as string,
    });

    if (error) {
      toast.error(`שגיאה ביצירת ליד: ${error}`);
    } else {
      toast.success("ליד נוסף בהצלחה!");
      setOpen(false);
      router.refresh();
    }
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ הוסף ליד</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>הוסף ליד חדש</DialogTitle>
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
              defaultValue={LEAD_STATUSES.NEW}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {Object.values(LEAD_STATUSES).map((s) => (
                <option key={s} value={s}>
                  {s}
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
