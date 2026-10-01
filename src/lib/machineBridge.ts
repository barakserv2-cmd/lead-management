import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * גשר למכונת הגיוס — צד התשובות.
 * כל תשובה שיוצאת מהמערכת (סוכן AI או רכזת) נשלחת גם למכונה החדשה
 * לצורך מסך "השוואת מציאות" בתקופת ה-shadow.
 *
 * עקרון ברזל: הפונקציה לעולם לא זורקת ולעולם לא מעכבת — כשל בגשר
 * לא נוגע בזרימה הקיימת.
 */
export async function forwardReplyToMachine(
  phone: string | null | undefined,
  content: string,
  author: "crm" | "human"
): Promise<void> {
  const url = process.env.MACHINE_INGEST_URL;
  const key = process.env.MACHINE_INGEST_KEY;
  if (!url || !key || !phone || !content?.trim()) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(`${url}/api/v1/bridge/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-key": key },
      body: JSON.stringify({ phone, content: content.trim(), author }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (e) {
    console.error("[MachineBridge] reply forward failed:", (e as Error).message);
  }
}

/**
 * הודעת רכזת שיוצאת ממספר הבוט.
 *
 * 17.09: מועמדת כתבה לבוט, תמי לקחה שליטה — ו-V1 חסם כי חלון 24 השעות
 * פתוח רק במספר שהמועמדת כתבה אליו. כשהמועמד/ת מדברים עם הבוט, התשובה
 * של הרכזת יוצאת מאותו מספר ובאותה שיחה.
 * check: רק בודק אם אפשר (לפני שהצ'אט עוצר את הבוט).
 */
export async function sendViaMachine(
  phone: string,
  content: string,
  opts: { check?: boolean } = {}
): Promise<{ ok: boolean; reason?: string }> {
  const url = process.env.MACHINE_INGEST_URL;
  const key = process.env.MACHINE_INGEST_KEY;
  if (!url || !key || !phone) return { ok: false, reason: "not_configured" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${url}/api/v1/bridge/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-key": key },
      body: JSON.stringify({ phone, content, check: opts.check === true }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return (await res.json()) as { ok: boolean; reason?: string };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * Tell Gubget whether it may keep talking to a candidate. "bot" releases it
 * back to autonomous handling; "human" keeps it frozen. Returns true on
 * success so the caller can surface a failure (unlike the fire-and-forget
 * reply forward, the recruiter needs to know if the release didn't land).
 */
/**
 * שם שרכזת תיקנה בכרטיס — מעבירים אותו לבוט.
 *
 * 15.09: ליד מגוגל נכנס בשם "נדב שפירא" עם מספר שהתברר כשייך לעסק גינון,
 * והבוט פנה בשם הזה. רכזת בררה, מצאה שהמספר של נוי שושן ותיקנה את הכרטיס
 * — אבל הבוט המשיך להחזיק את השם הישן, כי הקליטה שלו לא דורסת שם קיים.
 * בשיחה חיה זה היה אומר שהבוט ממשיך לפנות בשם השגוי גם אחרי התיקון.
 *
 * best-effort: כשל כאן לא נוגע בשמירה עצמה.
 */
export async function pushNameToMachine(
  phone: string | null | undefined,
  name: string | null | undefined
): Promise<void> {
  const url = process.env.MACHINE_INGEST_URL;
  const key = process.env.MACHINE_INGEST_KEY;
  if (!url || !key || !phone || !name?.trim()) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(`${url}/api/v1/candidate-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-key": key },
      body: JSON.stringify({ phone, name: name.trim() }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch (e) {
    console.error("[MachineBridge] name push failed:", (e as Error).message);
  }
}

export async function setMachineConversationMode(
  phone: string | null | undefined,
  mode: "bot" | "human",
  /** הליד נסגר ב-V1 — גובגט סוגר גם את האסקלציות הפתוחות שלו */
  closedStatus?: string
): Promise<boolean> {
  const url = process.env.MACHINE_INGEST_URL;
  const key = process.env.MACHINE_INGEST_KEY;
  if (!url || !key || !phone) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url}/api/v1/conversation-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-key": key },
      body: JSON.stringify({ phone, mode, ...(closedStatus ? { closedStatus } : {}) }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    return res.ok;
  } catch (e) {
    console.error("[MachineBridge] set conversation mode failed:", (e as Error).message);
    return false;
  }
}

// ============================================================
// דחיפת לידים חדשים לגובגט — תור עם ניסיונות חוזרים
// ============================================================
//
// ועדת הבחינה 29.09 (חודש 1, סעיף 2): הקרון דחף רק לידים מ-3 הדקות
// האחרונות, לא בדק את התשובה ולא רשם כלום. כשגובגט נפל ליותר מזה
// (14–16.09) הלידים של אותם ימים לא הגיעו אליו אף פעם.
//
// עכשיו כל ליד חדש מחכה בתור (machine_pushed_at ריק) עד שגובגט עונה 2xx.
// דחיפה שנכשלה חוזרת עם השהיה שגדלה (1, 2, 4… עד 30 דקות) במשך 3 ימים.
// גובגט מזהה כפילות (R-102), אז דחיפה כפולה לא שולחת שתי הודעות פתיחה.

const GUBGET_EMAIL = "gubget@eilatjobs.com";
const NO_PHONE = /^(no-phone-|anon-)/;

/** כמה זמן ליד נשאר בתור לפני שמוותרים עליו (הרשת של sync-stale-leads ממשיכה 7 ימים). */
export const PUSH_WINDOW_DAYS = 3;
/** ליד שנכשל ומחכה יותר מזה — השומר מתריע. */
export const PUSH_BACKLOG_ALERT_MIN = 10;

export interface MachinePushLead {
  id: string;
  phone: string | null;
  name: string | null;
  location: string | null;
  source: string | null;
  job_title: string | null;
  handled_by: string | null;
  do_not_contact?: boolean | null;
  machine_push_attempts?: number | null;
}

function bridgeConfig(): { url: string; key: string } | null {
  const url = process.env.MACHINE_INGEST_URL;
  const key = process.env.MACHINE_INGEST_KEY;
  return url && key ? { url, key } : null;
}

/** למה לא לדחוף את הליד הזה, או null כשצריך לדחוף. */
export function pushSkipReason(l: Pick<MachinePushLead, "phone" | "source" | "handled_by" | "do_not_contact">): string | null {
  if (!l.phone || NO_PHONE.test(l.phone)) return "no_phone";
  if (l.source === "גובגט") return "own_lead"; // לא מחזירים לגובגט את הלידים שלו
  // מישהו כבר מחזיק בליד — הודעת פתיחה מגובגט תהיה קול שני על מועמד שרכזת
  // כבר מטפלת בו (למשל ליד שרכזת הקלידה ידנית). sync-stale-leads יחזיר
  // אותו לגובגט אם הרכזת תשתוק.
  if (l.handled_by && l.handled_by.trim().toLowerCase() !== GUBGET_EMAIL) return "owned";
  if (l.do_not_contact) return "dnc";
  return null;
}

/** השהיה לפני הניסיון הבא, לפי מספר הכשלונות עד עכשיו. */
export function pushBackoffMinutes(failures: number): number {
  return Math.min(30, 2 ** Math.max(0, failures - 1));
}

/** תשובה שאומרת "הליד הזה פסול" — אין טעם לנסות שוב. 401/403/404 הם תקלת הגדרה, כן מנסים. */
export function isPermanentRejection(status: number): boolean {
  return status === 400 || status === 409 || status === 422;
}

type PostResult = { ok: true } | { ok: false; status?: number; error: string };

/** POST אחד לגובגט. לעולם לא זורק. */
export async function postLeadToMachine(
  l: Pick<MachinePushLead, "phone" | "name" | "location" | "source" | "job_title">
): Promise<PostResult> {
  const cfg = bridgeConfig();
  if (!cfg) return { ok: false, error: "machine bridge not configured" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${cfg.url}/api/v1/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-key": cfg.key },
      body: JSON.stringify({
        phone: l.phone,
        name: l.name ?? undefined,
        city: l.location ?? undefined,
        source_key: "lead_management_bridge",
        campaign: l.source ?? undefined,
        job_hint: l.job_title ?? undefined,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}` };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.name === "AbortError" ? "timeout (5s)" : err.message };
  }
}

export type PushOutcome =
  | { kind: "sent" }
  | { kind: "skipped"; reason: string }
  | { kind: "rejected"; error: string }
  | { kind: "failed"; error: string };

/**
 * דוחף ליד אחד ורושם את התוצאה על הליד. לעולם לא זורק.
 * כשהגשר לא מוגדר — לא נוגעים בליד (נשאר בתור), והקרון מדווח על כך.
 */
export async function pushLeadToMachine(db: SupabaseClient, lead: MachinePushLead): Promise<PushOutcome> {
  const now = new Date();
  const skip = pushSkipReason(lead);
  if (skip) {
    await markPush(db, lead.id, { machine_pushed_at: now.toISOString(), machine_push_note: `skip:${skip}` });
    return { kind: "skipped", reason: skip };
  }

  const res = await postLeadToMachine(lead);
  if (res.ok) {
    await markPush(db, lead.id, {
      machine_pushed_at: new Date().toISOString(),
      machine_push_note: "sent",
      machine_push_error: null,
      machine_push_next_at: null,
    });
    return { kind: "sent" };
  }
  if (!bridgeConfig()) return { kind: "failed", error: res.error };

  const failures = (lead.machine_push_attempts ?? 0) + 1;
  if (res.status !== undefined && isPermanentRejection(res.status)) {
    console.error(`[MachineBridge] lead ${lead.id} rejected by גובגט:`, res.error);
    await markPush(db, lead.id, {
      machine_pushed_at: now.toISOString(),
      machine_push_note: `rejected:${res.status}`,
      machine_push_attempts: failures,
      machine_push_error: res.error.slice(0, 500),
    });
    return { kind: "rejected", error: res.error };
  }
  await markPush(db, lead.id, {
    machine_push_attempts: failures,
    machine_push_next_at: new Date(now.getTime() + pushBackoffMinutes(failures) * 60_000).toISOString(),
    machine_push_error: res.error.slice(0, 500),
  });
  return { kind: "failed", error: res.error };
}

async function markPush(db: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("leads").update(patch).eq("id", id);
  if (error) console.error(`[MachineBridge] mark lead ${id} failed:`, error.message);
}

export interface MachinePushRun {
  ok: boolean;
  error?: string;
  considered: number;
  sent: number;
  skipped: number;
  rejected: number;
  failed: number;
  lastError?: string;
}

const PUSH_COLUMNS = "id, phone, name, location, source, job_title, handled_by, do_not_contact, machine_push_attempts";

/**
 * מעבד את התור. רץ מ-cron/sync-new-leads כל דקה.
 * `ok: false` רק כשהקרון עצמו לא יכול לעבוד (גשר לא מוגדר, שגיאת DB).
 * גובגט שלא עונה אינו כשל של הקרון — השומר רואה אותו דרך pushBacklog.
 */
export async function runMachinePush(db: SupabaseClient, now: Date = new Date()): Promise<MachinePushRun> {
  const run: MachinePushRun = { ok: true, considered: 0, sent: 0, skipped: 0, rejected: 0, failed: 0 };
  if (!bridgeConfig()) return { ...run, ok: false, error: "machine bridge not configured" };

  const since = new Date(now.getTime() - PUSH_WINDOW_DAYS * 86400_000).toISOString();
  // חצי דקה של ראש גדול לדחיפה ש-/api/gmail עושה מיד אחרי הקליטה
  const settled = new Date(now.getTime() - 30_000).toISOString();
  const { data, error } = await db
    .from("leads")
    .select(PUSH_COLUMNS)
    .is("machine_pushed_at", null)
    .gte("created_at", since)
    .lte("created_at", settled)
    .or(`machine_push_next_at.is.null,machine_push_next_at.lte.${now.toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return { ...run, ok: false, error: error.message };

  const deadline = Date.now() + 40_000;
  let streak = 0;
  for (const lead of (data ?? []) as MachinePushLead[]) {
    // גובגט לא עונה — לא שורפים את כל הריצה על timeouts; הבאה בעוד דקה
    if (streak >= 3 || Date.now() > deadline) break;
    run.considered++;
    const out = await pushLeadToMachine(db, lead);
    run[out.kind]++;
    if (out.kind === "failed") {
      streak++;
      run.lastError = out.error;
    } else {
      streak = 0;
    }
  }
  return run;
}

export interface PushBacklog {
  count: number;
  oldestMinutes: number;
  lastError: string | null;
}

/**
 * לידים שניסינו לדחוף, נכשלנו, ומחכים יותר מ-10 דקות.
 * null כשהגשר לא מוגדר (על זה מתריע הדופק של sync-new-leads) או כשהשאילתה נכשלה.
 */
export async function pushBacklog(db: SupabaseClient, now: Date = new Date()): Promise<PushBacklog | null> {
  if (!bridgeConfig()) return null;
  const since = new Date(now.getTime() - PUSH_WINDOW_DAYS * 86400_000).toISOString();
  const before = new Date(now.getTime() - PUSH_BACKLOG_ALERT_MIN * 60_000).toISOString();
  const { data, count, error } = await db
    .from("leads")
    .select("created_at, machine_push_error", { count: "exact" })
    .is("machine_pushed_at", null)
    .gt("machine_push_attempts", 0)
    .gte("created_at", since)
    .lte("created_at", before)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    console.error("[MachineBridge] backlog read failed:", error.message);
    return null;
  }
  const oldest = data?.[0];
  if (!count || !oldest) return { count: 0, oldestMinutes: 0, lastError: null };
  return {
    count,
    oldestMinutes: Math.round((now.getTime() - new Date(oldest.created_at as string).getTime()) / 60_000),
    lastError: (oldest.machine_push_error as string | null) ?? null,
  };
}
