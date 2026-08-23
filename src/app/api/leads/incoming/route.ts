import { NextRequest, NextResponse } from "next/server";
import { getMessageScope, scopeFilter } from "@/lib/messageVisibility";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

// הודעות נכנסות ממועמדים מאז חותמת זמן נתונה — מזין את ההקפצה
// האוטומטית של חלון הצ'אט בעמוד הלידים.

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = request.nextUrl.searchParams.get("since");
  const sinceIso = since && !Number.isNaN(Date.parse(since))
    ? new Date(since).toISOString()
    : new Date(Date.now() - 60_000).toISOString();

  const admin = getAdmin();
  // Pop-ups only for conversations this recruiter may see.
  const scope = await getMessageScope(user.email);
  let q = admin
    .from("messages")
    .select("id, lead_id, content, created_at")
    .eq("role", "user")
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(20);
  const f = scopeFilter(scope);
  if (f) q = q.or(f);
  const { data: msgs, error } = await q;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!msgs || msgs.length === 0) return NextResponse.json({ items: [] });

  // שולפים את הלידים של ההודעות (ייחודיים) כדי שהחלון יוכל להיפתח
  // גם אם הליד לא נמצא בעמוד הנוכחי של הטבלה.
  const leadIds = [...new Set(msgs.map((m) => m.lead_id))];
  const { data: leads } = await admin
    .from("leads")
    .select(
      "id, created_at, name, phone, email, age, location, experience, job_title, source, status, sub_status, " +
      "rejection_reason, hired_client, hired_position, start_date, arrival_date, interview_date, " +
      "interview_notes, followup_notes, notes, tags, screening_score, screening_motivation_score, " +
      "screening_fit_score, screening_availability_score, screening_experience_score, extracted_availability, " +
      "extracted_salary_expectation, extracted_location_pref, extracted_interests, needs_attention, " +
      "attention_reason, needs_human_attention, human_attention_reason, human_attention_raised_at"
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
