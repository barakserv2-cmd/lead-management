"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { STATUS_LABELS, type LeadStatusValue } from "@/lib/stateMachine";

type Dup = {
  id: string;
  name: string | null;
  phone: string | null;
  status: LeadStatusValue;
  sub_status: string | null;
  source: string | null;
  created_at: string;
};

// Shows a banner when other lead cards share this candidate's phone, with a
// one-click merge. The card further along the pipeline survives; the recruiter
// is redirected to it if the current card was the one merged away.
export function DuplicatesSection({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [dups, setDups] = useState<Dup[]>([]);
  const [merging, setMerging] = useState<string | null>(null);

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

  if (dups.length === 0) return null;

  async function merge(dupId: string) {
    if (merging) return;
    if (!confirm("למזג את שני הכרטיסים לכרטיס אחד? הכרטיס המתקדם בתהליך יישמר וההערות יאוחדו. הפעולה אינה הפיכה.")) return;
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

  return (
    <div dir="rtl" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <div className="text-sm font-semibold text-amber-900 mb-2">
        נמצאו {dups.length} כרטיסים כפולים לאותו מספר טלפון
      </div>
      <div className="space-y-1.5">
        {dups.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-2 bg-white rounded-lg border border-amber-200 px-3 py-2 text-xs"
          >
            <span className="font-medium text-gray-800">{d.name || "ללא שם"}</span>
            <span className="text-gray-400 tabular-nums">{d.phone}</span>
            <span className="text-gray-500">
              {STATUS_LABELS[d.status] ?? d.status}
              {d.sub_status ? ` · ${d.sub_status}` : ""}
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
        ))}
      </div>
    </div>
  );
}
