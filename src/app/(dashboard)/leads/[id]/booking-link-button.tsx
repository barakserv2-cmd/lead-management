"use client";

// שליחת לינק תיאום ראיון עצמי מכרטיס הליד — המועמד בוחר מועד
// מהחלונות של הרכזת המחוברת, בלי שיחת טלפון.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function BookingLinkButton({
  leadId,
  hasPhone,
}: {
  leadId: string;
  hasPhone: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<"phone" | "in_person" | "video">("phone");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/booking/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, interviewType: type }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error ?? "השליחה נכשלה");
        return;
      }
      toast.success("לינק התיאום נשלח בוואטסאפ");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as "phone" | "in_person" | "video")}
        className="border rounded-md px-2 py-1.5 text-sm"
        disabled={busy}
      >
        <option value="phone">ראיון טלפוני</option>
        <option value="in_person">ראיון פרונטלי</option>
        <option value="video">ראיון וידאו</option>
      </select>
      <Button size="sm" onClick={send} disabled={busy || !hasPhone}>
        {busy ? "שולח..." : "שלח לינק תיאום עצמי"}
      </Button>
      {!hasPhone && (
        <span className="text-xs text-gray-400">לליד אין מספר טלפון</span>
      )}
    </div>
  );
}
