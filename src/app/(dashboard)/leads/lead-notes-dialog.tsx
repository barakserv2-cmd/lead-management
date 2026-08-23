"use client";

import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LeadEventsSection } from "./lead-events-section";

/**
 * One-click "הערה" button that opens the candidate's journal: add a note
 * and see everything written about them so far (notes, calls, status
 * changes). Reuses the same journal as the lead page, so it's one history.
 */
export function LeadNotesDialog({
  leadId,
  leadName,
  size = "sm",
}: {
  leadId: string;
  leadName: string;
  size?: "sm" | "xs";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50 ${
          size === "xs" ? "h-7 px-2 text-xs" : ""
        }`}
        title="הוסף הערה וצפה בהיסטוריה של המועמד"
      >
        <NotebookPen className="w-4 h-4" />
        הערה
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-2xl max-h-[85vh] overflow-y-auto"
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>הערות והיסטוריה — {leadName}</DialogTitle>
            <DialogDescription>
              כל מה שנכתב על המועמד: הערות, שיחות, שינויי סטטוס. ההערה נשמרת גם בכרטיס הליד.
            </DialogDescription>
          </DialogHeader>
          {open && <LeadEventsSection leadId={leadId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
