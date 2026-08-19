"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { STATUS_LABELS, type LeadStatusValue } from "@/lib/stateMachine";
import { formatPhoneDisplay } from "@/lib/phone";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Dup = {
  id: string;
  name: string | null;
  phone: string | null;
  status: LeadStatusValue;
  sub_status: string | null;
  source: string | null;
  created_at: string;
};

const CONFIRM_TEXT =
  "למזג את שני הכרטיסים לכרטיס אחד?\nהכרטיס המתקדם יותר בתהליך יישמר; ההיסטוריה, ההודעות וההערות של השני יעברו אליו והוא יימחק.\nהפעולה אינה הפיכה.";

/**
 * Candidate de-duplication for one lead card:
 *  - a banner when other cards share this phone (rare since migration 00047
 *    made phone unique per candidate, but old / foreign / odd numbers can
 *    still collide);
 *  - a "merge with another card" dialog for the cases the DB can't catch
 *    (same person, different / missing phone).
 * The card further along the pipeline survives; if the current card is the
 * one merged away the recruiter is sent to the survivor.
 */
export function DuplicatesSection({
  leadId,
  compact = false,
  onMerged,
}: {
  leadId: string;
  /** drawer mode: smaller footprint */
  compact?: boolean;
  /** called after a merge with the surviving card id (before navigation) */
  onMerged?: (winnerId: string) => void;
}) {
  const router = useRouter();
  const [dups, setDups] = useState<Dup[]>([]);
  const [merging, setMerging] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Dup[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/leads/${leadId}/duplicates`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setDups(d.duplicates ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [leadId]);

  // debounced search for the manual-merge picker
  useEffect(() => {
    if (!pickerOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/leads/search?q=${encodeURIComponent(q)}&exclude=${leadId}`)
        .then((r) => r.json())
        .then((d) => {
          if (alive) setResults(d.leads ?? []);
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, pickerOpen, leadId]);

  async function merge(dupId: string) {
    if (merging) return;
    if (!confirm(CONFIRM_TEXT)) return;
    setMerging(dupId);
    try {
      const res = await fetch(`/api/leads/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, duplicateId: dupId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "שגיאה במיזוג");
        return;
      }
      toast.success("הכרטיסים מוזגו לכרטיס אחד");
      setPickerOpen(false);
      onMerged?.(data.winnerId);
      if (data.winnerId && data.winnerId !== leadId) {
        router.push(`/leads/${data.winnerId}`);
      } else {
        setDups((prev) => prev.filter((d) => d.id !== dupId));
        router.refresh();
      }
    } finally {
      setMerging(null);
    }
  }

  function Row({ d }: { d: Dup }) {
    return (
      <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2 text-xs">
        <span className="font-medium text-gray-800 truncate">{d.name || "ללא שם"}</span>
        <span className="text-gray-400 tabular-nums" dir="ltr">
          {formatPhoneDisplay(d.phone)}
        </span>
        <span className="text-gray-500 truncate">
          {STATUS_LABELS[d.status] ?? d.status}
          {d.sub_status ? ` · ${d.sub_status}` : ""}
          {d.source ? ` · ${d.source}` : ""}
        </span>
        <button
          type="button"
          onClick={() => merge(d.id)}
          disabled={!!merging}
          className="mr-auto px-3 py-1 bg-amber-600 text-white rounded-md font-semibold hover:bg-amber-700 disabled:opacity-50 shrink-0"
        >
          {merging === d.id ? "ממזג..." : "מזג"}
        </button>
      </div>
    );
  }

  return (
    <div dir="rtl" className={compact ? "mb-3" : "mb-4"}>
      {dups.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 mb-2">
          <div className="text-sm font-semibold text-amber-900 mb-2">
            נמצאו {dups.length} כרטיסים כפולים לאותו מספר טלפון
          </div>
          <div className="space-y-1.5">
            {dups.map((d) => (
              <Row key={d.id} d={d} />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="text-xs text-gray-500 hover:text-amber-700 underline underline-offset-2"
      >
        מזג עם כרטיס אחר של אותו מועמד…
      </button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>איחוד מועמד</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500 -mt-1 mb-2">
            חפשו את הכרטיס הכפול לפי שם או טלפון. הכרטיס המתקדם יותר בתהליך יישמר, וכל ההיסטוריה של השני תעבור אליו.
          </p>
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="שם או מספר טלפון…"
          />
          <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto">
            {searching && <div className="text-xs text-gray-400 px-1">מחפש…</div>}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <div className="text-xs text-gray-400 px-1">לא נמצאו כרטיסים תואמים</div>
            )}
            {results.map((d) => (
              <Row key={d.id} d={d} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
