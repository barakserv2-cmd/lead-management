import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsappService";

// Vercel cron pings this URL every hour at :30 (see vercel.json).
// Guarded by CRON_SECRET so it can't be hit anonymously from outside.
//
// היה פעם ביום ב-09:00 UTC, וכל ראיון שנקבע אחרי שהקרון רץ לא נתפס לעולם —
// ב-27/08 רק 3 מתוך 11 מועמדי היום קיבלו תזכורת. הבדיקה עברה לכל שעה;
// occurrence_key שומר על שליחה אחת בלבד לכל מועמד לכל תאריך ראיון.
// הריצה ב-:30 כדי שהשליחה הראשונה בחלון תיפול בדיוק על 16:30 שעון ישראל.

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface RunSummary {
  rule: string;
  attempted: number;
  succeeded: number;
  failed: number;
  details: string[];
}

const LOCK_TTL_MS = 24 * 60 * 60 * 1000;

// חלון שליחה — סער ביקש שהתזכורת תצא ב-16:30 (שעון ישראל) יום לפני הראיון.
// הקרון רץ כל שעה ב-:30 (vercel.json); ריצות לפני 16:30 מדלגות, וריצות
// מאוחרות יותר (עד 22:00) תופסות מועמדים שהראיון שלהם נקבע אחרי 16:30.
const SEND_START_HOUR = 16;
const SEND_START_MINUTE = 30;
const SEND_END_HOUR = 22; // לא שולחים וואטסאפ בשעות הלילה

function israelClock(at: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hour: get("hour") % 24, minute: get("minute") };
}

// ── Rule 1: Interview reminder, 16:30 the day before ────────
// Send a WhatsApp to every lead whose interview is tomorrow — and on
// Thursdays also to Sunday's interviews ("ביום ראשון" instead of "מחר"),
// so nobody gets a reminder on Shabbat with the wrong wording.
// Idempotent per (lead_id, date) via cron_reminders.occurrence_key.
async function runInterviewReminders(admin: ReturnType<typeof getAdmin>): Promise<RunSummary> {
  const summary: RunSummary = {
    rule: "interview_tomorrow",
    attempted: 0,
    succeeded: 0,
    failed: 0,
    details: [],
  };

  const { hour, minute } = israelClock(new Date());
  const afterStart = hour > SEND_START_HOUR || (hour === SEND_START_HOUR && minute >= SEND_START_MINUTE);
  if (!afterStart || hour >= SEND_END_HOUR) {
    summary.details.push(`מחוץ לחלון השליחה (${hour}:${String(minute).padStart(2, "0")}) — תזכורות יוצאות בין 16:30 ל-22:00`);
    return summary;
  }

  // Day bounds by the Israel calendar day. interview_date is stored as the
  // Israel wall-clock time with a +00:00 label (naive), so we build the
  // bounds in that same naive frame instead of a rolling hour window —
  // otherwise a 00:00 (date-only) interview two days out gets "מחר".
  const todayIl = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const weekday = new Date(`${todayIl}T00:00:00Z`).getUTCDay(); // 0=ראשון … 4=חמישי

  const targets: { offsetDays: number; label: string }[] = [{ offsetDays: 1, label: "מחר" }];
  // חמישי: מתזכרים כבר עכשיו את ראיונות יום ראשון. occurrence_key מבטיח
  // שמי שקיבל בחמישי לא יקבל שוב בשבת, ומי שנקבע אחרי חמישי ייתפס בשבת כ"מחר".
  if (weekday === 4) targets.push({ offsetDays: 3, label: "ביום ראשון" });

  for (const target of targets) {
    const dayStart = new Date(`${todayIl}T00:00:00Z`);
    dayStart.setUTCDate(dayStart.getUTCDate() + target.offsetDays);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const { data: leads } = await admin
      .from("leads")
      .select("id, name, phone, interview_date, interview_type")
      .eq("status", "INTERVIEW_BOOKED")
      .not("phone", "is", null)
      .gte("interview_date", dayStart.toISOString())
      .lt("interview_date", dayEnd.toISOString());

    if (!leads || leads.length === 0) {
      summary.details.push(`אין ראיונות ${target.label}`);
      continue;
    }

    for (const lead of leads) {
      summary.attempted++;
      const interviewAt = new Date(lead.interview_date as string);
      const dateKey = interviewAt.toISOString().slice(0, 10);
      const occurrenceKey = `interview_${dateKey}_${lead.id}`;

      // Idempotency check
      const { data: existing } = await admin
        .from("cron_reminders")
        .select("id")
        .eq("occurrence_key", occurrenceKey)
        .maybeSingle();
      if (existing) {
        summary.details.push(`כבר נשלח: ${lead.name}`);
        continue;
      }

      // Naive frame: stored UTC fields ARE the Israel wall-clock values.
      const hh = interviewAt.getUTCHours().toString().padStart(2, "0");
      const mm = interviewAt.getUTCMinutes().toString().padStart(2, "0");
      const hasTime = !(hh === "00" && mm === "00"); // date-only entries
      const type = lead.interview_type === "video" ? "ראיון וידאו" : "ראיון פרונטלי";
      const message =
        `שלום ${lead.name},\n` +
        (hasTime
          ? `תזכורת אוטומטית: ${target.label} בשעה ${hh}:${mm} יש לך ${type}.\n`
          : `תזכורת אוטומטית: ${target.label} יש לך ${type}.\n`) +
        `בהצלחה! 🎯`;

      const sendRes = await sendWhatsAppMessage(lead.phone as string, message);

      // Save the message to the lead's history too
      if (sendRes.success) {
        await admin.from("messages").insert({
          lead_id: lead.id,
          role: "recruiter",
          content: message,
        });
      }

      await admin.from("cron_reminders").insert({
        lead_id: lead.id,
        reminder_type: "interview_tomorrow",
        occurrence_key: occurrenceKey,
        payload: { interview_at: lead.interview_date, type: lead.interview_type },
        success: sendRes.success,
        error: sendRes.error ?? null,
      });

      if (sendRes.success) {
        summary.succeeded++;
        summary.details.push(`נשלח (${target.label}): ${lead.name} (${hh}:${mm})`);
      } else {
        summary.failed++;
        summary.details.push(`כשל: ${lead.name} — ${sendRes.error}`);
      }
    }
  }

  return summary;
}

// ── Rule 2: Stale-claim cleanup ─────────────────────────────
// Lazy filter already hides locked leads from the pool after 24h,
// but here we actively NULL the DB so reports + queries stay clean.
async function runStaleClaimCleanup(admin: ReturnType<typeof getAdmin>): Promise<RunSummary> {
  const summary: RunSummary = {
    rule: "stale_claim_cleanup",
    attempted: 0,
    succeeded: 0,
    failed: 0,
    details: [],
  };

  const cutoff = new Date(Date.now() - LOCK_TTL_MS).toISOString();
  const { data, error } = await admin
    .from("leads")
    .update({ assigned_to: null, assigned_at: null })
    .lt("assigned_at", cutoff)
    .not("assigned_to", "is", null)
    .select("id");

  if (error) {
    summary.failed = 1;
    summary.details.push(`error: ${error.message}`);
    return summary;
  }

  summary.attempted = data?.length ?? 0;
  summary.succeeded = data?.length ?? 0;
  summary.details.push(`שוחררו ${summary.succeeded} נעילות ישנות`);
  return summary;
}

// ── Orchestrator ────────────────────────────────────────────
async function runDailyCron() {
  const admin = getAdmin();
  const results = await Promise.all([
    runInterviewReminders(admin),
    runStaleClaimCleanup(admin),
  ]);
  return { ok: true, ran_at: new Date().toISOString(), rules: results };
}

function isAuthorized(req: NextRequest): boolean {
  // Local / curl test: allow if no CRON_SECRET configured.
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyCron();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/daily] fatal", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
