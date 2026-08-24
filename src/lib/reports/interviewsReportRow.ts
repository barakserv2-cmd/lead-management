import { LeadStatus } from "@/lib/stateMachine";
import type { InterviewReportRow } from "./interviewsXlsx";

// Leads imported from an "אקסטרות"/Excel campaign go to the extras block.
const EXTRA_SOURCE = /אקסטר|excel/i;

export const INTERVIEW_REPORT_SELECT =
  "name, phone, interview_date, job_title, hired_position, hired_client, interview_notes, start_date, status, source, preferences";

export function leadToReportRow(l: Record<string, unknown>): InterviewReportRow {
  const status = l.status as string;
  const prefs = (l.preferences as Record<string, unknown> | null) ?? null;
  const matched = typeof prefs?.matched_client === "string" ? (prefs.matched_client as string) : null;
  const arrived: InterviewReportRow["arrived"] =
    status === LeadStatus.ARRIVED || status === LeadStatus.HIRED || status === LeadStatus.STARTED
      ? "הגיע"
      : status === LeadStatus.NO_SHOW
        ? "לא הגיע"
        : "";
  const accepted: InterviewReportRow["accepted"] =
    status === LeadStatus.HIRED || status === LeadStatus.STARTED
      ? "התקבל"
      : status === LeadStatus.REJECTED
        ? "לא התקבל"
        : "";
  return {
    name: (l.name as string) ?? "ללא שם",
    phone: (l.phone as string | null) ?? null,
    interview_date: l.interview_date as string,
    role: (l.hired_position as string | null) ?? (l.job_title as string | null) ?? null,
    isExtra: EXTRA_SOURCE.test(String(l.source ?? "")),
    notes: (l.interview_notes as string | null) ?? null,
    commitment_date: (l.start_date as string | null) ?? null,
    arrived,
    accepted,
    accepted_to: (l.hired_client as string | null) ?? matched,
  };
}
