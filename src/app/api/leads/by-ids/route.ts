import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/api-auth";

// שחזור החלונות הצפים אחרי ניווט: הרכזת פתחה מועמדים, ניווטה (חיפוש,
// סינון, רענון) — והלידים האלה כבר אינם בעמוד הנוכחי של הטבלה. כאן
// שולפים אותם לפי מזהה כדי שהחלונות ייפתחו בדיוק כפי שהיו.
//
// אין כאן הרחבת הרשאות: הטבלה קריאה לכל מגייס/ת, וזה בדיוק מה שהיה
// פתוח לפניה על המסך רגע קודם.

const MAX_IDS = 8;

// אותה רשימת שדות כמו עמוד הלידים (LEAD_LIST_COLUMNS). 30.09: הרשימה כאן
// פיגרה אחרי השדות שנוספו ב-main (סוג מועמד, מגיע עם חבר, סוג ראיון) —
// חלון שנפתח מכאן הציג אותם ריקים, ו"שמור" במידע הגיוס היה מוחק ערכים קיימים.
const LEAD_COLUMNS =
  "id, created_at, name, phone, phone2, email, age, location, experience, job_title, source, status, sub_status, " +
  "rejection_reason, hired_client, hired_position, start_date, arrival_date, interview_date, interview_type, " +
  "candidate_segment, comes_with_friend, companion_name, channel, " +
  "interview_notes, followup_notes, notes, tags, screening_score, screening_motivation_score, " +
  "screening_fit_score, screening_availability_score, screening_experience_score, extracted_availability, " +
  "extracted_salary_expectation, extracted_location_pref, extracted_interests, needs_attention, " +
  "attention_reason, needs_human_attention, human_attention_reason, human_attention_raised_at, " +
  "handled_by, handled_at, last_contact_at, sub_status_at, updated_at, bot_paused, assigned_to, assigned_at";

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({ leads: [] });

  const { data, error } = await getAdmin().from("leads").select(LEAD_COLUMNS).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leads: data ?? [] });
}
