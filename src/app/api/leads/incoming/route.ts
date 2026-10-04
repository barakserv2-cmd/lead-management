import { NextRequest, NextResponse } from "next/server";
import { getMessageScope, scopeFilter } from "@/lib/messageVisibility";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/api-auth";

// הודעות נכנסות ממועמדים מאז חותמת זמן נתונה — מזין את ההקפצה
// האוטומטית של חלון הצ'אט בעמוד הלידים.

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = request.nextUrl.searchParams.get("since");
  const sinceIso = since && !Number.isNaN(Date.parse(since))
    ? new Date(since).toISOString()
    : new Date(Date.now() - 60_000).toISOString();

  const admin = getAdmin();
  // Pop-ups only for conversations this recruiter may see.
  const scope = await getMessageScope(user.email);
  if (!scope.notify) return NextResponse.json({ items: [] });
  const incoming = () =>
    admin
      .from("messages")
      .select("id, lead_id, content, created_at")
      .eq("role", "user")
      .gt("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(20);

  let msgs: { id: string; lead_id: string; content: string; created_at: string }[];
  if (scope.all || scope.shared) {
    let q = incoming();
    const f = scopeFilter(scope);
    if (f) q = q.or(f);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    msgs = data ?? [];
  } else {
    // Limited to her own (sees_shared_chats = false): her number, plus גובגט's
    // conversations only on leads she handles. Filtered in the query, not
    // after it — a page of other leads' messages would otherwise hide hers.
    const [own, onHerLeads] = await Promise.all([
      incoming().or(scopeFilter(scope)!),
      admin
        .from("messages")
        .select("id, lead_id, content, created_at, leads!inner(handled_by)")
        .eq("role", "user")
        .is("via_instance", null)
        .eq("leads.handled_by", scope.email!)
        .gt("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(20),
    ]);
    const error = own.error ?? onHerLeads.error;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const byId = new Map<string, { id: string; lead_id: string; content: string; created_at: string }>();
    for (const m of [...(own.data ?? []), ...(onHerLeads.data ?? [])]) {
      byId.set(m.id, { id: m.id, lead_id: m.lead_id, content: m.content, created_at: m.created_at });
    }
    msgs = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 20);
  }
  if (!msgs || msgs.length === 0) return NextResponse.json({ items: [] });

  // שולפים את הלידים של ההודעות (ייחודיים) כדי שהחלון יוכל להיפתח
  // גם אם הליד לא נמצא בעמוד הנוכחי של הטבלה.
  const leadIds = [...new Set(msgs.map((m) => m.lead_id))];
  const { data: leads } = await admin
    .from("leads")
    .select(
      "id, created_at, name, phone, email, age, location, experience, job_title, source, status, sub_status, " +
      "rejection_reason, hired_client, hired_position, start_date, arrival_date, interview_date, interview_type, " +
      "candidate_segment, comes_with_friend, companion_name, channel, " +
      "interview_notes, followup_notes, notes, tags, screening_score, screening_motivation_score, " +
      "screening_fit_score, screening_availability_score, screening_experience_score, extracted_availability, " +
      "extracted_salary_expectation, extracted_location_pref, extracted_interests, needs_attention, " +
      "attention_reason, needs_human_attention, human_attention_reason, human_attention_raised_at, " +
      "handled_by, handled_at, last_contact_at, sub_status_at, updated_at, bot_paused, assigned_to, assigned_at"
    )
    .in("id", leadIds);

  // supabase-js לא מנתח את מחרוזת העמודות הארוכה — ממירים ידנית
  const leadRows = (leads ?? []) as unknown as { id: string }[];
  const leadById = new Map(leadRows.map((l) => [l.id, l]));

  return NextResponse.json({
    items: msgs
      .filter((m) => leadById.has(m.lead_id))
      .map((m) => ({
        message: { id: m.id, content: m.content, created_at: m.created_at },
        lead: leadById.get(m.lead_id),
      })),
  });
}
