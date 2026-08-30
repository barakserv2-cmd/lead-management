import { getSupabaseAdmin } from "@/lib/api-auth";
import { LeadStatus } from "@/lib/stateMachine";
import { InterviewsContent, type InterviewRow } from "./interviews-content";

export const dynamic = "force-dynamic";

// Interviews board: by default every lead with a scheduled interview from 90
// days back (so no-shows / arrived are still visible) to two months ahead.
// ?from/?to replace that window with an explicit range, so a search can reach
// interviews outside it. Filtering, grouping by day and search are
// client-side — the volume is small.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from: fromParam, to: toParam } = await searchParams;
  const customFrom = DATE_RE.test(fromParam ?? "") ? fromParam! : null;
  const customTo = DATE_RE.test(toParam ?? "") ? toParam! : null;
  const isCustom = !!(customFrom || customTo);

  const supabase = getSupabaseAdmin();

  const from = new Date();
  from.setDate(from.getDate() - 90);
  const to = new Date();
  to.setDate(to.getDate() + 60);

  // interview_date הוא שעון קיר ישראלי עם תווית UTC, אז גבולות היום נבנים
  // באותה מסגרת — Z ולא +03:00 (ראו 00060 / cron/daily).
  const rangeStart = isCustom ? `${customFrom ?? "1970-01-01"}T00:00:00Z` : from.toISOString();
  const rangeEnd = isCustom ? `${customTo ?? "2999-12-31"}T23:59:59Z` : to.toISOString();

  const [{ data: leads }, { data: profiles }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, name, phone, job_title, location, status, interview_date, interview_type, interview_notes, rejection_reason, hired_client, hired_position, handled_by, source, preferences, notes"
      )
      .not("interview_date", "is", null)
      .gte("interview_date", rangeStart)
      .lte("interview_date", rangeEnd)
      .in("status", [
        LeadStatus.INTERVIEW_BOOKED,
        LeadStatus.ARRIVED,
        LeadStatus.NO_SHOW,
        LeadStatus.HIRED,
        LeadStatus.STARTED,
        LeadStatus.NOT_ACCEPTED,
        LeadStatus.REJECTED,
      ])
      .order("interview_date", { ascending: true })
      .limit(isCustom ? 2000 : 1000),
    supabase.from("user_profiles").select("email, name"),
  ]);

  const nameByEmail = new Map<string, string>();
  for (const p of (profiles ?? []) as { email: string | null; name: string | null }[]) {
    if (p.email && p.name) nameByEmail.set(p.email, p.name);
  }

  // ההערה האחרונה מיומן המועמד — מה שהרכזת כתבה עליו לאחרונה, כדי שלא
  // צריך לפתוח כרטיס כדי לדעת מה קורה איתו. lead_events בלבד: שינויי סטטוס
  // כבר נראים בגלולת הסטטוס. אם הטבלה חסרה — הלוח פשוט יוצג בלי הערות.
  const leadIds = ((leads ?? []) as Array<{ id: string }>).map((l) => l.id);
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
      // הרשומות מגיעות מהחדשה לישנה — הראשונה שנתקלים בה היא האחרונה
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

  const rows: InterviewRow[] = ((leads ?? []) as Array<Record<string, unknown>>).map((l) => {
    const prefs = (l.preferences as Record<string, unknown> | null) ?? null;
    const matched = typeof prefs?.matched_client === "string" ? (prefs.matched_client as string) : null;
    const handledBy = (l.handled_by as string | null) ?? null;
    const note = lastNoteByLead.get(l.id as string) ?? null;
    return {
      id: l.id as string,
      name: (l.name as string) ?? "ללא שם",
      phone: (l.phone as string | null) ?? null,
      job_title: (l.hired_position as string | null) ?? (l.job_title as string | null) ?? null,
      location: (l.location as string | null) ?? null,
      status: l.status as InterviewRow["status"],
      interview_date: l.interview_date as string,
      interview_type: (l.interview_type as InterviewRow["interview_type"]) ?? null,
      interview_notes: (l.interview_notes as string | null) ?? null,
      rejection_reason: (l.rejection_reason as string | null) ?? null,
      last_note: note
        ? {
            text: note.text,
            type: note.type,
            at: note.at,
            by: note.by ? (nameByEmail.get(note.by) ?? note.by) : null,
          }
        : null,
      client: (l.hired_client as string | null) ?? matched,
      recruiter: handledBy ? (nameByEmail.get(handledBy) ?? handledBy) : null,
      source: (l.source as string | null) ?? null,
    };
  });

  return (
    <InterviewsContent
      rows={rows}
      customRange={isCustom ? { from: customFrom, to: customTo } : null}
    />
  );
}
