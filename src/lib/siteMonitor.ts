import type { SupabaseClient } from "@supabase/supabase-js";
import { alertViaGubget } from "@/lib/gubgetAlert";

// ============================================================
// ניטור טפסי האתר eilatjobs.com — נולד מהתקלה של 29.09.
//
// ב-29.09 ב-14:50 הופעלה ב-WP Rocket דחיית סקריפטים. אלמנטור פרו הוחרג
// ממנה ואלמנטור הבסיסי לא — פרו רץ לפני הבסיס, קרס (elementorModules is
// not defined), ואף טופס באתר לא נשלח במשך 18 שעות. מנהל מחובר מקבל גרסה
// לא-מואצת, אז מהאדמין הכל נראה תקין. התגלה במקרה, למחרת.
//
// שתי שכבות, כי כל אחת לבדה לא מספיקה:
//  1. בדיקה טכנית — טוענים את הדפים כמבקר אנונימי ובודקים שקוד הטפסים
//     של אלמנטור פרו רץ אחרי קוד הבסיס. בדיוק סוג התקלה הזה, ובלי
//     אזעקות שווא: זו עובדה על ה-HTML, לא הסקה סטטיסטית.
//  2. שקט חריג — אין פנייה מטופס באתר, בזמן שלפי הקצב של אותן שעות
//     ב-14 הימים האחרונים היו מצופות לפחות 6. שקט רגיל באתר מגיע עד
//     12 שעות (שישי), אז סף קבוע של "X שעות" היה מתריע כל כמה ימים.
//
// ההתראה יוצאת דרך גובגט: המופע של GreenAPI שממנו V1 שולח לסער נמחק
// ב-14.09, וגובגט הוא הערוץ היחיד שמגיע בוודאות (תבנית staff_alert).
// ============================================================

const SITE = "https://www.eilatjobs.com";
const PAGES = ["/", "/landing/work-in-eilat/"];
const UA_MOBILE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

/** כותרות המיילים של טפסי האתר — אותן כותרות ש-gmail.ts ממפה למקורות. */
export const SITE_FORM_SUBJECT_RE =
  /(ליד חדש משרה באתר|ליד חדש - עמוד ראשי מהאתר|ליד מהאתר טופס תחתון|ליד חדש בדף נחיתה|Новый лид)/i;
const SITE_FORM_SUBJECT_SQL =
  "(ליד חדש משרה באתר|ליד חדש - עמוד ראשי מהאתר|ליד מהאתר טופס תחתון|ליד חדש בדף נחיתה|Новый лид)";

const ALERT_START_HOUR = 8;
const ALERT_END_HOUR = 22;
const RATE_WINDOW_DAYS = 14;
const EXPECTED_MIN = 6; // P(0 כשמצופים 6) ≈ 0.25%

export interface SiteMonitorSummary {
  checked: number;
  alerts: number;
  details: string[];
}

function israelHour(at: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour12: false,
    hour: "2-digit",
  }).format(at);
  return Number(h) % 24;
}

function israelDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(at);
}

// ── שכבה 1: סדר הריצה של הסקריפטים ─────────────────────────

interface ScriptTag {
  src: string;
  phase: 1 | 2 | 3; // 1 = רץ בזמן הפענוח, 2 = defer/async, 3 = נדחה עד אינטראקציה
  index: number;
}

/** מפרק את תגי ה-script עם מקור, בסדר המסמך, ומסווג מתי כל אחד ירוץ. */
export function parseScripts(html: string): ScriptTag[] {
  const tags: ScriptTag[] = [];
  const re = /<script\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const src = attrs.match(/\b(?:data-rocket-src|src)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    const delayed = /rocketlazyloadscript/i.test(attrs) || /data-rocket-src/i.test(attrs);
    const deferred = /\s(defer|async)(\s|=|$)/i.test(attrs);
    tags.push({ src, phase: delayed ? 3 : deferred ? 2 : 1, index: tags.length });
  }
  return tags;
}

/**
 * האם הטפסים יעבדו? הקוד של אלמנטור פרו (שמחבר את כפתור השליחה) תלוי
 * ב-elementorModules שמגיע מ-frontend-modules של הבסיס. הדפדפן מריץ קודם
 * את הסקריפטים הרגילים בסדר המסמך, אחר כך את ה-defer, ואת הנדחים בסוף —
 * אז משווים לפי (שלב, מיקום).
 */
export function checkFormScripts(html: string): string | null {
  if (!/elementor-form/.test(html)) return null; // אין טופס בדף — אין מה לבדוק
  const scripts = parseScripts(html);
  const core = scripts.find((s) => /\/plugins\/elementor\/assets\/js\/frontend-modules(\.min)?\.js/.test(s.src));
  const pro = scripts.find((s) => /\/plugins\/elementor-pro\/assets\/js\/frontend(\.min)?\.js/.test(s.src));
  if (!core) return "קוד הבסיס של אלמנטור (frontend-modules) לא נטען";
  if (!pro) return "קוד הטפסים של אלמנטור פרו לא נטען";
  const before = pro.phase < core.phase || (pro.phase === core.phase && pro.index < core.index);
  if (before) {
    return "קוד הטפסים של אלמנטור פרו רץ לפני קוד הבסיס — הטפסים לא נשלחים (כמו ב-29.09)";
  }
  return null;
}

async function fetchPage(path: string, ua: string): Promise<{ status: number; html: string } | { error: string }> {
  try {
    const res = await fetch(`${SITE}${path}`, {
      headers: { "user-agent": ua, "cache-control": "no-cache" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    return { status: res.status, html: await res.text() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function runScriptCheck(): Promise<{ problems: string[]; checked: number }> {
  const problems: string[] = [];
  let checked = 0;
  for (const path of PAGES) {
    for (const [device, ua] of [["נייד", UA_MOBILE], ["מחשב", UA_DESKTOP]] as const) {
      checked++;
      const res = await fetchPage(path, ua);
      if ("error" in res) {
        problems.push(`${path} (${device}): לא נטען — ${res.error}`);
        continue;
      }
      if (res.status !== 200) {
        problems.push(`${path} (${device}): קוד ${res.status}`);
        continue;
      }
      const issue = checkFormScripts(res.html);
      if (issue) problems.push(`${path} (${device}): ${issue}`);
    }
  }
  return { problems, checked };
}

// ── שכבה 2: שקט חריג ─────────────────────────────────────────

/** כל הפניות מטפסי האתר מאז `since`: לידים חדשים + פניות חוזרות של מועמדים קיימים. */
async function siteTouchesSince(db: SupabaseClient, since: string): Promise<string[]> {
  const [{ data: leads }, { data: repeats }] = await Promise.all([
    db.from("leads")
      .select("created_at")
      .gte("created_at", since)
      .filter("original_email_subject", "imatch", SITE_FORM_SUBJECT_SQL)
      .limit(5000),
    db.from("cron_reminders")
      .select("created_at, payload")
      .eq("reminder_type", "repeat_inquiry")
      .gte("created_at", since)
      .limit(5000),
  ]);
  const times = (leads ?? []).map((r) => String(r.created_at));
  for (const r of repeats ?? []) {
    const detail = String((r.payload as { detail?: string } | null)?.detail ?? "");
    if (SITE_FORM_SUBJECT_RE.test(detail)) times.push(String(r.created_at));
  }
  return times.sort();
}

/** כמה פניות היו מצופות בין `from` ל-`to`, לפי הממוצע לכל שעה ביום ב-14 הימים האחרונים. */
export function expectedTouches(history: string[], from: Date, to: Date, windowDays: number): number {
  const perHour = new Array(24).fill(0);
  for (const t of history) perHour[israelHour(new Date(t))]++;
  for (let h = 0; h < 24; h++) perHour[h] /= windowDays;

  let expected = 0;
  const step = 15 * 60_000; // רבעי שעה — מספיק מדויק ולא תלוי בעיגול
  for (let t = from.getTime(); t < to.getTime(); t += step) {
    expected += perHour[israelHour(new Date(t))] / 4;
  }
  return expected;
}

// ── שליחה ──────────────────────────────────────────────────

function alertSaar(title: string, subject: string, reason: string, text: string): Promise<string | null> {
  return alertViaGubget({ title, subject, reason, text, to: "admins" });
}

/** תופס מפתח אידמפוטנטיות; false = כבר התרענו. */
async function claim(db: SupabaseClient, type: string, key: string, payload: object): Promise<boolean> {
  const { error } = await db.from("cron_reminders").insert({
    reminder_type: type,
    occurrence_key: key,
    payload,
  });
  return !error;
}

async function release(db: SupabaseClient, key: string) {
  await db.from("cron_reminders").delete().eq("occurrence_key", key);
}

// ── הרצה ──────────────────────────────────────────────────────

export async function runSiteMonitor(db: SupabaseClient, now: Date = new Date()): Promise<SiteMonitorSummary> {
  const summary: SiteMonitorSummary = { checked: 0, alerts: 0, details: [] };
  const hour = israelHour(now);
  const awake = hour >= ALERT_START_HOUR && hour < ALERT_END_HOUR;

  // שכבה 1 — רצה כל שעה; ההתראה נשלחת רק בשעות היום, אחת ליום לכל תקלה.
  const { problems, checked } = await runScriptCheck();
  summary.checked = checked;
  const today = israelDate(now);

  if (problems.length > 0) {
    summary.details.push(...problems);
    const key = `site-forms-broken:${today}`;
    if (awake && (await claim(db, "site_forms_broken", key, { problems }))) {
      const reason = `${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} נוספים)` : ""}. בדוק שינויים אחרונים ב-WP Rocket או באלמנטור.`;
      const err = await alertSaar(
        "טפסי האתר לא עובדים",
        "האתר eilatjobs.com",
        reason,
        `🚨 טפסי האתר לא עובדים למבקרים\n\n${problems.join("\n")}\n\nמנהל מחובר לאדמין רואה גרסה אחרת — לבדוק בחלון גלישה בסתר.`
      );
      if (err) {
        await release(db, key); // שהריצה הבאה תנסה שוב
        summary.details.push(`שליחת התראה נכשלה: ${err}`);
      } else summary.alerts++;
    }
  } else {
    summary.details.push(`בדיקה טכנית תקינה (${checked} טעינות)`);
    // חזר לעבוד אחרי תקלה שדיווחנו עליה — סוגרים את המעגל
    const since = new Date(now.getTime() - 48 * 3_600_000).toISOString();
    const { data: open } = await db.from("cron_reminders")
      .select("occurrence_key")
      .eq("reminder_type", "site_forms_broken")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    const brokenKey = open?.[0]?.occurrence_key as string | undefined;
    if (brokenKey && awake && (await claim(db, "site_forms_recovered", `recovered:${brokenKey}`, {}))) {
      const err = await alertSaar(
        "טפסי האתר חזרו לעבוד",
        "האתר eilatjobs.com",
        "הבדיקה הטכנית עוברת שוב בכל הדפים שנבדקו.",
        "✅ טפסי האתר חזרו לעבוד — הבדיקה הטכנית עוברת בכל הדפים."
      );
      if (err) await release(db, `recovered:${brokenKey}`);
      else summary.alerts++;
    }
  }

  // שכבה 2 — שקט חריג, רק בשעות היום
  if (!awake) {
    summary.details.push("שקט חריג: מחוץ לשעות ההתראה");
    return summary;
  }
  const windowStart = new Date(now.getTime() - RATE_WINDOW_DAYS * 86_400_000).toISOString();
  const touches = await siteTouchesSince(db, windowStart);
  const last = touches[touches.length - 1];
  if (!last) {
    summary.details.push("שקט חריג: אין פניות מהאתר ב-14 יום — אין בסיס להשוואה");
    return summary;
  }
  const expected = expectedTouches(touches, new Date(last), now, RATE_WINDOW_DAYS);
  summary.details.push(`שקט חריג: הפנייה האחרונה ${last.slice(0, 16)}, מצופות מאז ${expected.toFixed(1)}`);
  if (expected < EXPECTED_MIN) return summary;

  const key = `site-silent:${last}`;
  if (await claim(db, "site_silent", key, { last, expected })) {
    const hours = Math.round((now.getTime() - new Date(last).getTime()) / 3_600_000);
    const lastIl = new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(new Date(last));
    const err = await alertSaar(
      "אין לידים מטפסי האתר",
      "האתר eilatjobs.com",
      `אין פנייה מטופס באתר כבר ${hours} שעות (האחרונה ${lastIl}), ולפי הקצב הרגיל היו מצופות כ-${Math.round(expected)}. לבדוק שהטפסים נשלחים.`,
      `📉 אין לידים מטפסי האתר כבר ${hours} שעות\nהאחרונה: ${lastIl}\nלפי הקצב של 14 הימים האחרונים היו מצופות כ-${Math.round(expected)} פניות.\nלבדוק: טופס בחלון גלישה בסתר, קמפיין בגוגל, שינויים באתר.`
    );
    if (err) {
      await release(db, key);
      summary.details.push(`שליחת התראת שקט נכשלה: ${err}`);
    } else summary.alerts++;
  }
  return summary;
}
