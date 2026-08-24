import { getSupabaseAdmin } from "@/lib/api-auth";
import { LeadStatus } from "@/lib/stateMachine";
import { InterviewsContent, type InterviewRow } from "./interviews-content";

export const dynamic = "force-dynamic";

// Interviews board: every lead with a scheduled interview, from 90 days back
// (so no-shows / arrived are still visible) to two months ahead. Filtering,
// grouping by day and search happen client-side — the volume is small.
export default async function InterviewsPage() {
  const supabase = getSupabaseAdmin();

  const from = new Date();
  from.setDate(from.getDate() - 90);
  const to = new Date();
  to.setDate(to.getDate() + 60);

  const [{ data: leads }, { data: profiles }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, name, phone, job_title, location, status, interview_date, interview_type, interview_notes, rejection_reason, hired_client, hired_position, handled_by, source, preferences, notes"
      )
      .not("interview_date", "is", null)
      .gte("interview_date", from.toISOString())
      .lte("interview_date", to.toISOString())
      .in("status", [
        LeadStatus.INTERVIEW_BOOKED,
        LeadStatus.ARRIVED,
        LeadStatus.NO_SHOW,
        LeadStatus.HIRED,
        LeadStatus.STARTED,
        LeadStatus.REJECTED,
      ])
      .order("interview_date", { ascending: true })
      .limit(1000),
    supabase.from("user_profiles").select("email, name"),
  ]);

  const nameByEmail = new Map<string, string>();
  for (const p of (profiles ?? []) as { email: string | null; name: string | null }[]) {
    if (p.email && p.name) nameByEmail.set(p.email, p.name);
  }

  const rows: InterviewRow[] = ((leads ?? []) as Array<Record<string, unknown>>).map((l) => {
    const prefs = (l.preferences as Record<string, unknown> | null) ?? null;
    const matched = typeof prefs?.matched_client === "string" ? (prefs.matched_client as string) : null;
    const handledBy = (l.handled_by as string | null) ?? null;
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
      client: (l.hired_client as string | null) ?? matched,
      recruiter: handledBy ? (nameByEmail.get(handledBy) ?? handledBy) : null,
      source: (l.source as string | null) ?? null,
    };
  });

  return <InterviewsContent rows={rows} />;
}
