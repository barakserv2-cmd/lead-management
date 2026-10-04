"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LeadStatus } from "@/lib/stateMachine";
import { changeLeadStatus } from "@/lib/changeLeadStatusClient";
import { InterviewScheduleDialog } from "../leads/interview-schedule-dialog";

/**
 * סגירת ראיון טלפוני בלחיצה אחת.
 *
 * גובגט קובע ראיונות טלפוניים, והתפריט הכללי מדבר בשפה של מפגש ("הגיע
 * לראיון", "לא הגיע"). הרכזת שמסיימת שיחה רוצה שלוש תשובות בלבד: דיברנו,
 * לא ענה, או שממשיכים לראיון פרונטלי (בקשת חושן, 24.09). התפריט המלא
 * נשאר לידם לכל שאר המקרים.
 */
export function PhoneInterviewActions({
  leadId,
  leadName,
}: {
  leadId: string;
  leadName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  async function setStatus(status: typeof LeadStatus.ARRIVED | typeof LeadStatus.NO_SHOW, label: string) {
    if (busy) return;
    setBusy(true);
    const res = await changeLeadStatus({ leadId, newStatus: status });
    setBusy(false);
    if (!res.success) {
      toast.error(res.error ?? "העדכון נכשל");
      // הסטטוס אולי השתנה בינתיים במסך אחר — מרעננים כדי שהשורה תציג את המצב האמיתי
      router.refresh();
      return;
    }
    toast.success(`${leadName} — ${label}`);
    router.refresh();
  }

  // הראיון הפרונטלי מחליף את המועד הטלפוני באותו כרטיס: הסטטוס כבר
  // "ראיון נקבע", ולכן מעדכנים תאריך וסוג ישירות ולא עוברים מצב.
  async function bookInPerson(interviewDate: string) {
    setBusy(true);
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interview_date: interviewDate, interview_type: "in_person" }),
    });
    setBusy(false);
    setScheduling(false);
    if (!res.ok) {
      toast.error("קביעת הראיון הפרונטלי נכשלה");
      return;
    }
    toast.success(`${leadName} — נקבע ראיון פרונטלי`);
    router.refresh();
  }

  const btn =
    "h-7 inline-flex items-center whitespace-nowrap px-2 text-xs rounded-md border transition-colors disabled:opacity-50";

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setStatus(LeadStatus.ARRIVED, "השיחה בוצעה")}
        title="השיחה התקיימה"
        className={`${btn} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}
      >
        ✅ בוצע
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setStatus(LeadStatus.NO_SHOW, "לא ענה")}
        title="לא ענה לשיחה"
        className={`${btn} border-red-300 text-red-700 hover:bg-red-50`}
      >
        📵 לא ענה
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setScheduling(true)}
        title="ממשיכים לראיון פרונטלי"
        className={`${btn} border-blue-300 text-blue-700 hover:bg-blue-50`}
      >
        🏢 פרונטלי
      </button>

      <InterviewScheduleDialog
        open={scheduling}
        loading={busy}
        onCancel={() => setScheduling(false)}
        onConfirm={({ interviewDate }) => bookInPerson(interviewDate)}
      />
    </>
  );
}
