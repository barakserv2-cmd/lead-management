"use client";

import { useEffect, useState } from "react";
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
import { StatusSelect } from "./status-select";

/**
 * One-click "הערה" button that opens the candidate's journal: add a note
 * and see everything written about them so far (notes, calls, status
 * changes). Reuses the same journal as the lead page, so it's one history.
 */
export function LeadNotesDialog({
  leadId,
  leadName,
  size = "sm",
  currentStatus,
  currentSubStatus,
}: {
  leadId: string;
  leadName: string;
  size?: "sm" | "xs" | "icon";
  /** כשהמסך כבר מחזיק את הסטטוס — חוסך קריאה ומציג אותו מיד */
  currentStatus?: string;
  currentSubStatus?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // כתיבת הערה ושינוי סטטוס הם אותו רגע בעבודה של הרכזת, והם היו בשני
  // מסכים נפרדים (בקשת חושן, 23.09). מסכים שלא מחזיקים את הסטטוס טוענים
  // אותו כאן בפתיחה.
  const [status, setStatus] = useState<{ status: string; sub: string | null } | null>(
    currentStatus ? { status: currentStatus, sub: currentSubStatus ?? null } : null
  );

  useEffect(() => {
    if (!open || status) return;
    let alive = true;
    fetch(`/api/leads/${leadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.lead?.status) {
          setStatus({ status: d.lead.status as string, sub: (d.lead.sub_status as string | null) ?? null });
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, status, leadId]);

  return (
    <>
      {size === "icon" ? (
        // בשורת טבלה: אייקון בלבד, כמו כפתורי הטלפון והוואטסאפ שלידו
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
          title="הערה — הוסף הערה וצפה בהיסטוריה של המועמד"
          aria-label="הערה"
        >
          <NotebookPen className="w-4 h-4" />
        </button>
      ) : (
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
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-2xl max-h-[85vh] overflow-y-auto"
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>הערות והיסטוריה — {leadName}</DialogTitle>
            <DialogDescription>
              כל מה שנכתב על המועמד: הערות, שיחות, שינויי סטטוס. מה שנכתב כאן נשמר ביומן
              האירועים ונשאר לתמיד — לא בשדה &quot;הערות&quot; שבכרטיס.
            </DialogDescription>
          </DialogHeader>
          {status && (
            <div className="flex items-center gap-2 border-b pb-3 mb-1">
              <span className="text-sm text-slate-600 shrink-0">סטטוס:</span>
              <div className="w-48">
                <StatusSelect
                  leadId={leadId}
                  leadName={leadName}
                  currentStatus={status.status}
                  currentSubStatus={status.sub}
                />
              </div>
            </div>
          )}
          {open && <LeadEventsSection leadId={leadId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
