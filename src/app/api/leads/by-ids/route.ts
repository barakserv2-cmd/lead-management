import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

// שחזור החלונות הצפים אחרי ניווט: הרכזת פתחה מועמדים, ניווטה (חיפוש,
// סינון, רענון) — והלידים האלה כבר אינם בעמוד הנוכחי של הטבלה. כאן
// שולפים אותם לפי מזהה כדי שהחלונות ייפתחו בדיוק כפי שהיו.
//
// אין כאן הרחבת הרשאות: הטבלה קריאה לכל מגייס/ת, וזה בדיוק מה שהיה
// פתוח לפניה על המסך רגע קודם.

const MAX_IDS = 8;

// אותה רשימת שדות שמזינה את חלון המועמד בהקפצת הודעה נכנסת
const LEAD_COLUMNS =
  "id, created_at, name, phone, email, age, location, experience, job_title, source, status, sub_status, " +
  "rejection_reason, hired_client, hired_position, start_date, arrival_date, interview_date, " +
  "interview_notes, followup_notes, notes, tags, screening_score, screening_motivation_score, " +
  "screening_fit_score, screening_availability_score, screening_experience_score, extracted_availability, " +
  "extracted_salary_expectation, extracted_location_pref, extracted_interests, needs_attention, " +
  "attention_reason, needs_human_attention, human_attention_reason, human_attention_raised_at";

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
