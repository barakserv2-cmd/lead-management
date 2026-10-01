// ============================================================
// דופק המשימות האוטומטיות + שומר שמתריע כשמשהו נתקע
// ============================================================
//
// ועדת הבחינה 29.09 (חודש 1, סעיף 1): כשמשימה אוטומטית נכשלה, אף אחד לא
// ידע. הקרונים החזירו 200 גם כשכל השליחות נכשלו, וב-29–30.09 המספר העסקי
// נמחק ו-13 תזכורות ראיון נכשלו בשקט.
//
// כל קרון רושם כל ריצה (withHeartbeat → job_heartbeats). השומר (runWatchdog)
// רץ מ-cron/scheduled ומ-cron/daily — כל אחד מהם משגיח גם על השני — ומתריע
// לאדמין פעם אחת לכל תקלה, ושוב כשהיא נפתרת. בלילה ובשבת/חג לא מתריעים:
// התקלה נשארת פתוחה וההתראה יוצאת כשהזמן השקט נגמר.

import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { alertAdmin, type AdminAlert } from "@/lib/adminAlert";
import { isQuietTimeNow } from "@/lib/sendGate";
import { pushBacklog } from "@/lib/machineBridge";

function db(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// ── רישום ריצה ────────────────────────────────────────────────

/** רושם ריצה. לעולם לא זורק — רישום שנכשל לא מפיל את המשימה עצמה. */
export async function recordJobRun(job: string, ok: boolean, error?: string | null): Promise<void> {
  try {
    const { error: rpcErr } = await db().rpc("record_job_run", {
      p_job: job,
      p_ok: ok,
      p_error: ok ? null : (error ?? "failed"),
    });
    if (rpcErr) console.error(`[jobHealth] record ${job} failed:`, rpcErr.message);
  } catch (e) {
    console.error(`[jobHealth] record ${job} threw:`, e);
  }
}

type RouteHandler = (req: NextRequest) => Promise<Response>;

/**
 * עוטף handler של קרון ורושם כל ריצה: הצלחה = סטטוס מתחת ל-400 ובלי
 * `ok: false` בגוף התשובה. 401 לא נרשם (זו לא ריצה, זו בקשה זרה) — ואם
 * הקרון עצמו לא מצליח להזדהות, השומר יתריע על שתיקה.
 */
export function withHeartbeat(job: string, handler: RouteHandler): RouteHandler {
  return async (req) => {
    let res: Response;
    try {
      res = await handler(req);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await recordJobRun(job, false, message);
      console.error(`[${job}] fatal:`, e);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
    if (res.status === 401) return res;

    let body: { ok?: boolean; error?: string } | null = null;
    try {
      body = await res.clone().json();
    } catch {
      /* not JSON — judge by status alone */
    }
    const ok = res.status < 400 && body?.ok !== false;
    await recordJobRun(job, ok, ok ? null : (body?.error ?? `HTTP ${res.status}`));
    return res;
  };
}

/**
 * כלל שכל הניסיונות שלו בריצה נכשלו — סימן לערוץ שנפל, לא למועמד בודד.
 * 29–30.09: 13 תזכורות ראיון נכשלו והקרון החזיר ok — אף אחד לא ידע.
 */
export function outageOf(
  results: { rule: string; succeeded: number; failed: number; details: string[] }[]
): string | null {
  const down = results.filter((r) => r.failed > 0 && r.succeeded === 0);
  if (down.length === 0) return null;
  return down
    .map((r) => {
      const first = r.details.find((d) => d.startsWith("כשל"));
      return `${r.rule}: ${r.failed} נכשלו${first ? ` (${first})` : ""}`;
    })
    .join("; ");
}

// ── מתי משימה נחשבת תקועה ─────────────────────────────────────

export interface JobRule {
  /** שם בעברית להתראה */
  label: string;
  /** אחרי כמה דקות בלי ריצה מוצלחת להתריע */
  staleAfterMin: number;
  /** אחרי כמה כשלונות רצופים להתריע (גם אם עבר פחות זמן) */
  failAfter: number;
}

/** המשימות שמשגיחים עליהן. התדירות שלהן ב-vercel.json. */
export const JOB_RULES: Record<string, JobRule> = {
  gmail: { label: "קליטת לידים מהמייל (Gmail)", staleAfterMin: 20, failAfter: 5 },
  "sync-new-leads": { label: "העברת לידים חדשים לגובגט", staleAfterMin: 15, failAfter: 10 },
  "sync-stale-leads": { label: "החזרת לידים תקועים לגובגט", staleAfterMin: 60, failAfter: 3 },
  // הודעה מתוזמנת שנכשלה לא חוזרת, אז שתי ריצות ברצף שכל שליחותיהן נכשלו הן כבר סימן
  scheduled: { label: "הודעות מתוזמנות ומנוע החוקים", staleAfterMin: 30, failAfter: 2 },
  daily: { label: "תזכורות ראיון ומשימות שעתיות", staleAfterMin: 150, failAfter: 2 },
  "sync-jobs": { label: "סנכרון משרות לגובגט", staleAfterMin: 300, failAfter: 2 },
  "feedback-digest": { label: "סיכום דיווחי הרכזות היומי", staleAfterMin: 26 * 60, failAfter: 1 },
  retention: { label: "מחיקה לפי מדיניות שמירה", staleAfterMin: 8 * 24 * 60, failAfter: 1 },
};

export interface HeartbeatRow {
  job: string;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  alert_open_since: string | null;
}

/**
 * מה לא בסדר במשימה, בעברית, או null כשהיא תקינה.
 * משימה שעוד לא רצה אף פעם (אין שורה) לא נבדקת — כך פריסה חדשה לא מתריעה.
 */
export function jobProblem(row: HeartbeatRow, rule: JobRule, now: Date = new Date()): string | null {
  if (row.consecutive_failures >= rule.failAfter) {
    return `נכשלה ${row.consecutive_failures} פעמים ברצף${row.last_error ? ` — ${row.last_error}` : ""}`;
  }
  const since = row.last_ok_at ?? null;
  if (!since) return null; // רצה, אבל עוד לא הספיקה להיכשל מספיק פעמים
  const minutes = (now.getTime() - new Date(since).getTime()) / 60_000;
  if (minutes < rule.staleAfterMin) return null;
  const ago = minutes >= 120 ? `${Math.round(minutes / 60)} שעות` : `${Math.round(minutes)} דקות`;
  return `לא רצה בהצלחה כבר ${ago}${row.last_error ? ` (שגיאה אחרונה: ${row.last_error})` : ""}`;
}

/** מה לעשות, כשאפשר לדעת מהשגיאה. */
export function problemHint(job: string, problem: string): string {
  if (job === "gmail" && /invalid_grant|token|unauthori[sz]ed|credentials|Connect Gmail/i.test(problem)) {
    return "\nכנראה שהחיבור ל-Gmail פג. אדמין: הגדרות ← חיבור Gmail ← לחבר מחדש.";
  }
  if (/Instance is deleted|notAuthorized/i.test(problem)) {
    return "\nמספר הוואטסאפ ב-GreenAPI נמחק או התנתק — צריך לבדוק בקונסולת GreenAPI.";
  }
  if (/machine bridge not configured/i.test(problem)) {
    return "\nחסרים MACHINE_INGEST_URL / MACHINE_INGEST_KEY ב-Vercel.";
  }
  return "";
}

// ── השומר ─────────────────────────────────────────────────────

export interface WatchdogSummary {
  checked: number;
  opened: string[];
  closed: string[];
  held: string[];
}

/** ההתראה על תקלה שנפתחה או נסגרה. */
export function incidentAlert(label: string, problem: string | null, hint = ""): AdminAlert {
  if (problem) {
    return {
      title: "תקלה במערכת",
      subject: label,
      reason: `${problem}${hint ? ` ${hint.trim()}` : ""}`,
      text: `⚠️ תקלה במערכת: ${label}\n${problem}${hint}`,
    };
  }
  return {
    title: "חזר לעבוד",
    subject: label,
    reason: "רץ שוב בהצלחה",
    text: `✅ חזר לעבוד: ${label}`,
  };
}

/** הבדיקה שעוסקת בגובגט עצמו — ההתראה עליה יוצאת קודם מ-GreenAPI. */
const GUBGET_BACKLOG = "gubget-push-backlog";

/**
 * פותח תקלה (ומתריע) או סוגר אותה (ומודיע שחזר לעבוד). הפתיחה אטומית:
 * שני שומרים שרצים יחד (scheduled ו-daily ב-:30) — רק אחד מהם שולח.
 */
async function setIncident(
  client: SupabaseClient,
  job: string,
  open: boolean,
  alert: AdminAlert
): Promise<boolean> {
  const now = new Date().toISOString();
  // שורה לבדיקות שאינן קרון (backlog) — נוצרת בפעם הראשונה
  await client.from("job_heartbeats").upsert({ job }, { onConflict: "job", ignoreDuplicates: true });
  const q = client.from("job_heartbeats").update({ alert_open_since: open ? now : null, updated_at: now }).eq("job", job);
  const { data } = await (open ? q.is("alert_open_since", null) : q.not("alert_open_since", "is", null)).select("job");
  if (!data || data.length === 0) return false; // מישהו אחר כבר פתח/סגר
  const res = await alertAdmin(alert, { gubgetLast: job === GUBGET_BACKLOG });
  if (!res.sent) {
    console.error(`[watchdog] alert for ${job} not sent:`, res.error);
    // התראת תקלה שלא יצאה — לא נשארים "פתוחים" בשקט; ננסה שוב בריצה הבאה
    if (open) await client.from("job_heartbeats").update({ alert_open_since: null }).eq("job", job);
    return false;
  }
  return true;
}

export async function runWatchdog(client: SupabaseClient = db()): Promise<WatchdogSummary> {
  const summary: WatchdogSummary = { checked: 0, opened: [], closed: [], held: [] };
  const now = new Date();
  const quiet = isQuietTimeNow(now);

  const { data: rows, error } = await client
    .from("job_heartbeats")
    .select("job, last_run_at, last_ok_at, last_error, consecutive_failures, alert_open_since");
  if (error) {
    console.error("[watchdog] read failed:", error.message);
    return summary;
  }
  const byJob = new Map((rows ?? []).map((r) => [r.job as string, r as HeartbeatRow]));

  const checks: { job: string; label: string; problem: string | null }[] = [];
  for (const [job, rule] of Object.entries(JOB_RULES)) {
    const row = byJob.get(job);
    if (!row?.last_run_at) continue;
    summary.checked++;
    checks.push({ job, label: rule.label, problem: jobProblem(row, rule, now) });
  }

  // לידים שלא הגיעו לגובגט — נבדק מהנתונים עצמם, לא מהדופק
  const backlog = await pushBacklog(client, now);
  if (backlog) {
    summary.checked++;
    checks.push({
      job: GUBGET_BACKLOG,
      label: "העברת לידים לגובגט",
      problem:
        backlog.count > 0
          ? `${backlog.count} לידים לא הגיעו לגובגט, הוותיק מחכה ${backlog.oldestMinutes} דקות` +
            (backlog.lastError ? ` (שגיאה אחרונה: ${backlog.lastError})` : "") +
            ". המערכת ממשיכה לנסות לבד."
          : null,
    });
  }

  for (const c of checks) {
    const openSince = byJob.get(c.job)?.alert_open_since ?? null;
    if (c.problem && !openSince) {
      if (quiet) {
        summary.held.push(c.job);
        continue;
      }
      const alert = incidentAlert(c.label, c.problem, problemHint(c.job, c.problem));
      if (await setIncident(client, c.job, true, alert)) summary.opened.push(c.job);
    } else if (!c.problem && openSince) {
      // חזר לעבוד בלילה? סוגרים בשקט; ביום — מודיעים
      if (quiet) {
        await client.from("job_heartbeats").update({ alert_open_since: null }).eq("job", c.job);
        summary.closed.push(c.job);
        continue;
      }
      if (await setIncident(client, c.job, false, incidentAlert(c.label, null))) summary.closed.push(c.job);
    }
  }
  return summary;
}
