import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { SENT_TO_INTERVIEW } from "@/lib/constants";
import { validateInterviewLocal } from "@/lib/interviewTime";

// "נשלח לראיון": המועמד הגיע למשרד ונשלח להתראיין אצל מעסיק. נשמר לאיזו
// משרה ומתי, נרשם ביומן, ואם הראיון ביום אחר נפתחת תזכורת לרכזת שעה לפניו —
// אחרת אין שום דבר שיזכיר לה לחזור אליו ביום הראיון.

const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// שעון קיר ישראלי → נקודת זמן אמיתית. ההיסט מחושב לתאריך עצמו (+03 בקיץ,
// +02 בחורף) — קבוע קשיח היה מזיז את התזכורת בשעה חצי מהשנה.
function israelWallToInstant(wall: string): Date {
  const asUtc = new Date(`${wall}:00Z`);
  const offset = (at: Date) => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at);
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - at.getTime();
  };
  const first = new Date(asUtc.getTime() - offset(asUtc));
  return new Date(asUtc.getTime() - offset(first));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;

  let body: { jobId?: string; when?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = String(body.jobId ?? "").trim();
  const when = String(body.when ?? "").trim();
  if (!jobId) return NextResponse.json({ error: "צריך לבחור משרה" }, { status: 400 });
  if (!WALL.test(when)) return NextResponse.json({ error: "מועד ראיון לא תקין" }, { status: 400 });
  const timeError = validateInterviewLocal(when);
  if (timeError) return NextResponse.json({ error: timeError }, { status: 400 });

  const admin = getSupabaseAdmin();

  const { data: job } = await admin
    .from("jobs")
    .select("id, title, clients(name)")
    .eq("id", jobId)
    .single<{ id: string; title: string; clients: { name: string } | null }>();
  if (!job) return NextResponse.json({ error: "המשרה לא נמצאה" }, { status: 404 });

  const { data: lead } = await admin
    .from("leads")
    .select("id, name")
    .eq("id", leadId)
    .single<{ id: string; name: string | null }>();
  if (!lead) return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });

  const employer = job.clients?.name ?? "מעסיק";
  const nowIsrael = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const interviewDay = when.slice(0, 10);
  const sameDay = interviewDay === nowIsrael;

  const { error: updateError } = await admin
    .from("leads")
    .update({
      sub_status: SENT_TO_INTERVIEW,
      sub_status_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
      sent_to_job_id: job.id,
      // שעון קיר עם תווית UTC — אותה קונבנציה כמו interview_date
      sent_interview_at: `${when}:00+00:00`,
    })
    .eq("id", leadId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const label = `${job.title} @ ${employer}`;
  const whenLabel = `${new Date(`${interviewDay}T12:00:00`).toLocaleDateString("he-IL", {
    weekday: "long", day: "numeric", month: "long",
  })} · ${when.slice(11)}`;

  await admin.from("lead_events").insert({
    lead_id: leadId,
    event_type: "שיבוץ",
    event_text: `נשלח לראיון: ${label} — ${whenLabel}`,
    created_by: user.email,
  }).then(() => undefined, () => undefined);

  // תזכורת רק כשהראיון ביום אחר. באותו יום הרכזת ממילא מטפלת בו עכשיו.
  let reminderAt: string | null = null;
  if (!sameDay) {
    const at = israelWallToInstant(when);
    at.setHours(at.getHours() - 1);
    if (at.getTime() > Date.now()) {
      reminderAt = at.toISOString();
      await admin.from("reminders").insert({
        lead_id: leadId,
        recruiter: user.email.toLowerCase(),
        title: `ראיון בעוד שעה — ${lead.name ?? "מועמד"} · ${label}`,
        due_date: reminderAt,
        priority: "high",
      }).then(() => undefined, () => undefined);
    }
  }

  await logAudit({
    action: "update",
    leadId,
    actor: user.email,
    changes: {
      sub_status: { from: null, to: SENT_TO_INTERVIEW },
      sent_to_job_id: { from: null, to: job.id },
      sent_interview_at: { from: null, to: when },
    },
    meta: { job: label, reminder_at: reminderAt },
  });

  return NextResponse.json({ ok: true, job: label, reminderAt, sameDay });
}
