import type { SupabaseClient } from "@supabase/supabase-js";
import { LeadStatus, type LeadStatusValue } from "@/lib/stateMachine";
import type { InterviewRow } from "@/app/(dashboard)/interviews/interviews-content";

const BOARD_STATUSES: LeadStatusValue[] = [
  LeadStatus.INTERVIEW_BOOKED,
  LeadStatus.ARRIVED,
  LeadStatus.NO_SHOW,
  LeadStatus.CANCELLED_ARRIVAL,
  LeadStatus.POSTPONED_ARRIVAL,
  LeadStatus.HIRED,
  LeadStatus.STARTED,
  LeadStatus.NOT_ACCEPTED,
  LeadStatus.REJECTED,
];

const LEAD_SELECT =
  "id, name, phone, job_title, location, status, sub_status, interview_date, interview_type, interview_notes, rejection_reason, sent_interview_at, jobs:sent_to_job_id (title, clients(name)), hired_client, hired_position, handled_by, source, preferences, notes, postponed_from_date";

/**
 * Shared interviews-board data. `typeMode` splits the two boards:
 *   - "phone"   → only phone screens (the "ראיון טלפון" tab in leads)
 *   - "frontal" → everything that isn't a phone screen (the /interviews board)
 *   - "all"     → both
 * A postponed ("דחה הגעה") candidate emits a second row on the original date.
 */
export async function fetchInterviewRows(
  supabase: SupabaseClient,
  opts: { rangeStart: string; rangeEnd: string; isCustom: boolean; typeMode: "frontal" | "phone" | "all" }
): Promise<InterviewRow[]> {
  const { rangeStart, rangeEnd, isCustom, typeMode } = opts;
  const limit = isCustom ? 2000 : 1000;

  const [{ data: byInterview }, { data: byPostponed }, { data: profiles }] = await Promise.all([
    supabase
      .from("leads")
      .select(LEAD_SELECT)
      .not("interview_date", "is", null)
      .gte("interview_date", rangeStart)
      .lte("interview_date", rangeEnd)
      .in("status", BOARD_STATUSES)
      .order("interview_date", { ascending: true })
      .limit(limit),
    supabase
      .from("leads")
      .select(LEAD_SELECT)
      .not("postponed_from_date", "is", null)
      .gte("postponed_from_date", rangeStart)
      .lte("postponed_from_date", rangeEnd)
      .limit(limit),
    supabase.from("user_profiles").select("email, name"),
  ]);

  const leadById = new Map<string, Record<string, unknown>>();
  for (const l of [...(byInterview ?? []), ...(byPostponed ?? [])] as Record<string, unknown>[]) {
    leadById.set(l.id as string, l);
  }
  const leads = [...leadById.values()];

  const inWindow = (d: unknown): boolean => {
    if (typeof d !== "string") return false;
    const t = new Date(d).getTime();
    return t >= new Date(rangeStart).getTime() && t <= new Date(rangeEnd).getTime();
  };
  // phone → only phone screens; frontal → anything that isn't a phone screen
  const keepType = (t: unknown): boolean =>
    typeMode === "all" ? true : typeMode === "phone" ? t === "phone" : t !== "phone";

  const nameByEmail = new Map<string, string>();
  for (const p of (profiles ?? []) as { email: string | null; name: string | null }[]) {
    if (p.email && p.name) nameByEmail.set(p.email, p.name);
  }

  const leadIds = leads.map((l) => l.id as string);
  const lastNoteByLead = new Map<string, { text: string; type: string; at: string; by: string | null }>();
  if (leadIds.length > 0) {
    const { data: events } = await supabase
      .from("lead_events")
      .select("lead_id, event_type, event_text, created_by, created_at")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false })
      .limit(4000);
    for (const e of (events ?? []) as Array<Record<string, unknown>>) {
      const leadId = e.lead_id as string;
      if (lastNoteByLead.has(leadId)) continue;
      const text = ((e.event_text as string | null) ?? "").trim();
      if (!text) continue;
      lastNoteByLead.set(leadId, {
        text,
        type: (e.event_type as string | null) ?? "הערה",
        at: e.created_at as string,
        by: (e.created_by as string | null) ?? null,
      });
    }
  }

  return leads.flatMap((l) => {
    if (!keepType(l.interview_type)) return [];
    const prefs = (l.preferences as Record<string, unknown> | null) ?? null;
    const matched = typeof prefs?.matched_client === "string" ? (prefs.matched_client as string) : null;
    const handledBy = (l.handled_by as string | null) ?? null;
    const note = lastNoteByLead.get(l.id as string) ?? null;
    const base = {
      id: l.id as string,
      name: (l.name as string) ?? "ללא שם",
      phone: (l.phone as string | null) ?? null,
      job_title: (l.hired_position as string | null) ?? (l.job_title as string | null) ?? null,
      location: (l.location as string | null) ?? null,
      interview_type: (l.interview_type as InterviewRow["interview_type"]) ?? null,
      interview_notes: (l.interview_notes as string | null) ?? null,
      rejection_reason: (l.rejection_reason as string | null) ?? null,
      sub_status: (l.sub_status as string | null) ?? null,
      sent_interview_at: (l.sent_interview_at as string | null) ?? null,
      sent_to_job: (() => {
        const j = l.jobs as { title?: string; clients?: { name?: string } | null } | null;
        if (!j?.title) return null;
        return j.clients?.name ? `${j.title} @ ${j.clients.name}` : j.title;
      })(),
      last_note: note
        ? { text: note.text, type: note.type, at: note.at, by: note.by ? (nameByEmail.get(note.by) ?? note.by) : null }
        : null,
      client: (l.hired_client as string | null) ?? matched,
      recruiter: handledBy ? (nameByEmail.get(handledBy) ?? handledBy) : null,
      source: (l.source as string | null) ?? null,
    };
    const status = l.status as InterviewRow["status"];
    const out: InterviewRow[] = [];
    if (inWindow(l.interview_date) && BOARD_STATUSES.includes(status)) {
      out.push({ ...base, status, interview_date: l.interview_date as string });
    }
    if (inWindow(l.postponed_from_date)) {
      out.push({
        ...base,
        status: LeadStatus.POSTPONED_ARRIVAL as InterviewRow["status"],
        interview_date: l.postponed_from_date as string,
        postponedOriginal: true,
      });
    }
    return out;
  });
}

/** Default board window: 90 days back to 60 ahead, or an explicit range. */
export function interviewWindow(customFrom: string | null, customTo: string | null): {
  rangeStart: string;
  rangeEnd: string;
  isCustom: boolean;
} {
  const isCustom = !!(customFrom || customTo);
  if (isCustom) {
    return {
      rangeStart: `${customFrom ?? "1970-01-01"}T00:00:00Z`,
      rangeEnd: `${customTo ?? "2999-12-31"}T23:59:59Z`,
      isCustom,
    };
  }
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const to = new Date();
  to.setDate(to.getDate() + 60);
  return { rangeStart: from.toISOString(), rangeEnd: to.toISOString(), isCustom };
}
