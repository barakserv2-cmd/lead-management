import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  throw new Error(
    "NEXT_PUBLIC_APP_URL is not configured — set it to your production URL (e.g. https://lead-management-umber.vercel.app)"
  );
}

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${getAppBaseUrl()}/api/auth/gmail/callback`
  );
}

export { createOAuth2Client };

export async function getGmailClient() {
  const oauth2Client = createOAuth2Client();

  // Try loading tokens from DB first
  const { data: settings } = await getSupabase()
    .from("settings")
    .select("gmail_access_token, gmail_refresh_token, gmail_token_expiry")
    .eq("id", 1)
    .single();

  if (settings?.gmail_refresh_token) {
    oauth2Client.setCredentials({
      access_token: settings.gmail_access_token ?? undefined,
      refresh_token: settings.gmail_refresh_token,
      expiry_date: settings.gmail_token_expiry
        ? new Date(settings.gmail_token_expiry).getTime()
        : undefined,
    });
  } else if (process.env.GMAIL_REFRESH_TOKEN) {
    // Fall back to env var
    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });
  } else {
    throw new Error("No Gmail credentials configured. Connect Gmail in Settings.");
  }

  // Auto-persist refreshed tokens back to DB
  oauth2Client.on("tokens", async (tokens) => {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (tokens.access_token) update.gmail_access_token = tokens.access_token;
    if (tokens.refresh_token) update.gmail_refresh_token = tokens.refresh_token;
    if (tokens.expiry_date) update.gmail_token_expiry = new Date(tokens.expiry_date).toISOString();

    await getSupabase().from("settings").update(update).eq("id", 1);
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

const SUBJECT_RE = /מועמדות חדשה מ(.+?)\s+למשרת\s+(.+)/;
const PHONE_RE = /0[2-9]\d-?\d{7}/g;
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const ALLJOBS_DOMAINS = ["alljob.co.il", "alljobs.co.il"];

// ── זיהוי גורם גיוס לפי כותרת המייל ──────────────────────────────
// כל שורה ממפה תבנית → שם גורם הגיוס שיישמר בשדה source.
// `match` נבדק מול הכותרת (אחרי ניקוי Fwd:/Re:), `from` נבדק מול השולח.
// כלל יכול לציין אחד מהם או את שניהם — כל התנאים שצוינו חייבים להתקיים.
// הוספת גורם חדש = הוספת שורה. הסדר קובע: הכלל הראשון שתואם מנצח,
// לכן תבניות ספציפיות צריכות להופיע לפני תבניות כלליות.
// התבנית יכולה להיות מחרוזת (חיפוש הכלה, לא רגיש לאותיות) או RegExp.
// המיפוי נבנה מסריקת התיבה barakserv2@eilatjobs.com (אוגוסט 2026).
const SOURCE_RULES: { match?: string | RegExp; from?: string | RegExp; source: string }[] = [
  // פייסבוק: קמפיינים מזוהים דינמית לפני הרשימה הזו — ראה detectFacebookCampaign.
  // הכללים כאן הם fallback לכותרות פייסבוק שלא בפורמט הקמפיינים.
  { match: /FB\s*JOBS/i, source: "פייסבוק" },
  { match: "facebook", source: "פייסבוק" },

  // AllJobs — "מועמדות חדשה מ<שם> למשרת <משרה>"
  { match: "מועמדות חדשה מ", source: "AllJobs" },

  // טפסי האתר eilatjobs.com (Elementor)
  { match: "ליד חדש משרה באתר", source: "אתר - טופס משרה" },
  { match: "ליד חדש - עמוד ראשי מהאתר", source: "אתר - עמוד ראשי" },
  { match: "ליד מהאתר טופס תחתון", source: "אתר - טופס תחתון" },
  { match: "הודעה חדשה מאת", source: "אתר - צור קשר" },

  // דפי נחיתה — "ליד חדש בדף נחיתה- עבודה באילת כולל מגורים"
  { match: "ליד חדש בדף נחיתה", source: "דף נחיתה" },

  // Unbounce — "[New Lead] Page: <שם דף>" מ-notifications@unbounce.com.
  // הדף "דרושים בתל אביב" מוזן מקמפיין פייסבוק ממומן (לפי סער, 13/08/2026).
  // דפים ספציפיים לפני הכלל הכללי!
  { match: "דרושים בתל אביב", from: "unbounce.com", source: "פייסבוק - דרושים תל אביב" },
  { match: "[New Lead]", from: "unbounce.com", source: "דף נחיתה" },

  // צ'אט AI באתר — "ליד חדש הגיע מהצ׳אט באתר!"
  { match: /מהצ[׳'"]?אט באתר/, source: "צ'אט באתר" },

  // פק"ש — הכותרת היא מספר פנייה בלבד ("1253"), הזיהוי לפי השולח
  { from: "pakash.co.il", source: 'פק"ש' },

  // שיחות ממספרים וירטואליים (מסקיו) — "שיחה חדשה מהמספרים הוירטואלים מסקיו"
  { match: "שיחה חדשה מהמספרים הוירטואלים", source: "טלפון" },
];

// ברירת מחדל כשאף כלל לא תואם
const DEFAULT_SOURCE = "אימייל ישיר";

// קידומות העברה/תגובה שמצטברות בתחילת כותרת ("Fwd: Re: Fwd: ...")
const REPLY_PREFIX_RE = /^\s*(?:(?:fwd|fw|re|השב|הועבר|תשובה)\s*:\s*)+/i;

/** מנקה קידומות Fwd:/Re:/FW: (גם מרובות) מתחילת הכותרת. */
export function stripReplyPrefixes(subject: string): string {
  return subject.replace(REPLY_PREFIX_RE, "").trim();
}

function matches(value: string, pattern: string | RegExp): boolean {
  return typeof pattern === "string"
    ? value.toLowerCase().includes(pattern.toLowerCase())
    : pattern.test(value);
}

// ── פירוק לפי UTM מגוף המייל ─────────────────────────────────────
// טפסי האתר מדווחים utm_source/utm_medium בגוף המייל (למשל
// "utm_source: google utm_medium: cpc"). כשליד מהאתר הגיע מקמפיין
// ממומן — מתייגים לפי הקמפיין במקום לפי הטופס. בלי UTM = אורגני.
const UTM_RULES: { source: RegExp; medium?: RegExp; label: string }[] = [
  { source: /google/i, medium: /cpc|ppc|paid/i, label: "גוגל ממומן" },
  { source: /facebook|^fb$|meta/i, label: "פייסבוק" },
  { source: /instagram|^ig$/i, label: "אינסטגרם" },
  { source: /tiktok/i, label: "טיקטוק" },
];

// המקורות שעליהם מפעילים פירוק UTM (טפסים באתר ודפי נחיתה)
const UTM_REFINABLE = new Set([
  "אתר - טופס משרה",
  "אתר - עמוד ראשי",
  "אתר - טופס תחתון",
  "אתר - צור קשר",
  "דף נחיתה",
  "צ'אט באתר",
]);

/** שולף utm_source/utm_medium מגוף המייל (תומך גם בקידומת cf- של Elementor). */
export function extractUtm(body: string): { source: string | null; medium: string | null } {
  const source = body.match(/(?:cf-)?utm_source:\s*([^\s]+)/i)?.[1] ?? null;
  const medium = body.match(/(?:cf-)?utm_medium:\s*([^\s]+)/i)?.[1] ?? null;
  // ערך שהוא בעצם השדה הבא (למשל "utm_source: utm_medium: ...") = ריק
  const clean = (v: string | null) => (v && !/^(cf-)?utm_/i.test(v) ? v : null);
  return { source: clean(source), medium: clean(medium) };
}

/** ממפה UTM לגורם גיוס ממומן, או null אם אין התאמה (=אורגני). */
export function detectSourceFromUtm(body: string): string | null {
  const utm = extractUtm(body);
  if (!utm.source) return null;
  for (const rule of UTM_RULES) {
    if (!rule.source.test(utm.source)) continue;
    if (rule.medium && !(utm.medium && rule.medium.test(utm.medium))) continue;
    return rule.label;
  }
  return null;
}

// ── פירוק קמפיינים של פייסבוק ────────────────────────────────────
// כותרות ליד-אדס של פייסבוק נראות כך: "<שם קמפיין>- new lead from FACEBOOK"
// (או "NEW LEAD FROM FB JOBS"). שם הקמפיין מחולץ דינמית מהכותרת, כך
// שקמפיין חדש מקבל תיוג משלו אוטומטית בלי לגעת בקוד:
// "BARAK- new lead from FACEBOOK"             → "פייסבוק - BARAK"
// "BARAK TLV CASHIERS- new lead from FACEBOOK" → "פייסבוק - BARAK TLV CASHIERS"
// "INFINES - NEW LEAD FROM FB JOBS"            → "פייסבוק - INFINES"
// כותרת בלי שם קמפיין → "פייסבוק"
const FB_CAMPAIGN_RE = /^(.*?)\s*[-–]?\s*new\s+lead\s+from\s+(?:facebook|fb\s*jobs)/i;

export function detectFacebookCampaign(subject: string): string | null {
  const m = stripReplyPrefixes(subject).match(FB_CAMPAIGN_RE);
  if (!m) return null;
  const campaign = m[1].replace(/[-–\s]+$/, "").replace(/\s+/g, " ").trim();
  return campaign ? `פייסבוק - ${campaign}` : "פייסבוק";
}

// ── שיחות ממסקיו (מספרים וירטואליים) ─────────────────────────────
// כל שיחה נכנסת למספר וירטואלי שולחת מייל קבוע-מבנה מ-noreplay@maskyoo.co.il:
// "היי, התקבלה שיחה חדשה. מקור: 073-8021099 מספר מתקשר: 050-1234567
//  ... סטטוס המענה לשיחה: ANSWER משך השיחה: 64 ... מספר יעד: 054-5273410"
// המבנה קבוע ולכן מפורק ישירות, בלי Claude. גם שיחות שלא נענו
// (NOANSWER/BUSY/CALLER CANCEL) הן לידים — מועמד שניסה להתקשר.
const MASKYOO_SUBJECT = "שיחה חדשה מהמספרים הוירטואלים";

// מספרים פנימיים של החברה — שיחה שמקורה בהם היא בדיקה/שיחה פנימית, לא ליד.
// (מספרי היעד של הניתובים + מספר האדמין)
export const INTERNAL_PHONE_NUMBERS = new Set([
  "0545273410", // Noam WhatsApp agent
  "0544324726",
  "0508990188",
  "0547000992", // admin
]);

export interface MaskyooCall {
  caller: string; // ספרות בלבד, למשל "0501234567"
  status: string | null; // ANSWER / NOANSWER / BUSY / CALLER CANCEL
  durationSeconds: number | null;
  virtualNumber: string | null; // המספר הווירטואלי שאליו התקשרו ("מקור")
  targetNumber: string | null; // לאן נותבה השיחה ("מספר יעד")
}

export function isMaskyooEmail(from: string, subject: string): boolean {
  return (
    matches(from, "maskyoo.co.il") ||
    stripReplyPrefixes(subject).includes(MASKYOO_SUBJECT)
  );
}

/** מפרק מייל התראת שיחה של מסקיו. מחזיר null אם מספר המתקשר לא נמצא. */
export function parseMaskyooCall(body: string): MaskyooCall | null {
  const digits = (s: string | undefined | null) =>
    s ? s.replace(/\D/g, "") : null;

  const caller = digits(body.match(/מספר מתקשר:\s*([\d\-+ ]+)/)?.[1]);
  if (!caller) return null;

  const duration = body.match(/משך השיחה:\s*(\d+)/)?.[1];
  return {
    caller,
    status: body.match(/סטטוס המענה לשיחה:\s*([A-Z ]+?)(?:\s*(?:משך|$))/)?.[1]?.trim() ?? null,
    durationSeconds: duration ? parseInt(duration, 10) : null,
    virtualNumber: digits(body.match(/מקור:\s*([\d\-+ ]+)/)?.[1]),
    targetNumber: digits(body.match(/מספר יעד:\s*([\d\-+ ]+)/)?.[1]),
  };
}

/**
 * מזהה גורם גיוס לפי כותרת המייל בלבד (מתעלם מכללים שדורשים שולח).
 * דוגמה: detectSourceFromSubject("Fwd: מועמדות חדשה מדני כהן למשרת מלצר") → "AllJobs"
 */
export function detectSourceFromSubject(subject: string): string | null {
  const fb = detectFacebookCampaign(subject);
  if (fb) return fb;

  const clean = stripReplyPrefixes(subject);
  for (const rule of SOURCE_RULES) {
    if (!rule.match) continue;
    if (matches(clean, rule.match)) return rule.source;
  }
  return null;
}

/**
 * זיהוי מלא לפי כותרת + שולח: הכלל הראשון שכל תנאיו מתקיימים מנצח.
 * אם עבר גם גוף המייל וזה ליד מטופס באתר — UTM של קמפיין ממומן גובר
 * (google/cpc → "גוגל ממומן"), בלי UTM נשאר התיוג האורגני של הטופס.
 * נופל לזיהוי לפי דומיין AllJobs (הכותרות שלהם משתנות, הדומיין קבוע),
 * ולבסוף לברירת מחדל.
 * דוגמה: detectSource('אתר pakash.co.il <info@pakash.co.il>', "1253") → 'פק"ש'
 */
export function detectSource(from: string, subject: string, body?: string): string {
  const fb = detectFacebookCampaign(subject);
  if (fb) return fb;

  const clean = stripReplyPrefixes(subject);
  for (const rule of SOURCE_RULES) {
    if (rule.match && !matches(clean, rule.match)) continue;
    if (rule.from && !matches(from, rule.from)) continue;

    if (body && UTM_REFINABLE.has(rule.source)) {
      const paid = detectSourceFromUtm(body);
      if (paid) return paid;
    }
    return rule.source;
  }

  const fromDomain = from.match(/@([^\s>]+)/)?.[1]?.toLowerCase() || "";
  if (ALLJOBS_DOMAINS.some((d) => fromDomain.includes(d))) return "AllJobs";

  return DEFAULT_SOURCE;
}

export function parseSubject(subject: string): {
  name: string | null;
  job_title: string | null;
} {
  const match = subject.match(SUBJECT_RE);
  if (match) {
    return { name: match[1].trim(), job_title: match[2].trim() };
  }
  return { name: null, job_title: null };
}

export function extractPhone(text: string): string | null {
  const matches = text.match(PHONE_RE);
  return matches ? matches[0] : null;
}

export function extractEmail(text: string): string | null {
  const matches = text.match(EMAIL_RE);
  if (!matches) return null;
  for (const email of matches) {
    const domain = email.split("@")[1].toLowerCase();
    if (!ALLJOBS_DOMAINS.some((d) => domain.includes(d))) {
      return email;
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|tr|li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractBodyFromPayload(payload: {
  mimeType?: string;
  body?: { data?: string };
  parts?: Array<{
    mimeType?: string;
    body?: { data?: string };
    parts?: unknown[];
  }>;
}): string {
  // If the payload has parts, recurse
  if (payload.parts) {
    // Prefer text/plain, fall back to text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return stripHtml(decodeBase64Url(part.body.data));
      }
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      if ((part as { parts?: unknown[] }).parts) {
        const result = extractBodyFromPayload(
          part as Parameters<typeof extractBodyFromPayload>[0]
        );
        if (result) return result;
      }
    }
  }

  // Single-part message
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      return stripHtml(decoded);
    }
    return decoded;
  }

  return "";
}

export function parseFromHeader(from: string): string | null {
  // "Display Name <email@example.com>" → "Display Name"
  const match = from.match(/^"?(.+?)"?\s*<.+>$/);
  if (match) {
    const name = match[1].trim();
    // Skip if the "name" is just an email address
    if (!name.includes("@") && name.length >= 2) return name;
  }
  return null;
}

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  body: string;
  date: string;
}

export async function fetchUnreadEmails(
  maxResults = 20
): Promise<GmailMessage[]> {
  return fetchEmailsByQuery(
    // See comment below — recent window + keyword group.
    "newer_than:1d {AllJobs CV קורות חיים משרה פנייה מועמד lead candidate CASHIERS \"FB JOBS\" INFINES נחיתה eilatjobs ליד מסקיו}",
    maxResults
  );
}

/** מביא מיילים לפי שאילתת Gmail חופשית (משמש גם סקריפטים חד-פעמיים). */
export async function fetchEmailsByQuery(
  q: string,
  maxResults = 20
): Promise<GmailMessage[]> {
  const gmail = await getGmailClient();

  const res = await gmail.users.messages.list({
    userId: "me",
    // The standard scraper query (see fetchUnreadEmails) uses a RECENT WINDOW
    // instead of is:unread. Relying on is:unread was fragile: opening a lead
    // email in Gmail marks it read, so the scraper then never processed it and
    // the lead was lost. Dedup is handled downstream by original_email_id, so
    // re-scanning recent read mail is safe (no dupes). newer_than:1d keeps the
    // batch small/recent so today's leads aren't buried under a huge unread
    // backlog. Landing-page keywords (נחיתה/eilatjobs/ליד) were added so
    // Elementor form emails, which carry none of the job-board keywords, match
    // too. מסקיו matches Maskyoo call notifications — every incoming call
    // (answered or missed) becomes a phone lead via parseMaskyooCall.
    // False positives are harmless — parseEmailWithAI drops anything that isn't a lead.
    q,
    maxResults,
  });

  const messages = res.data.messages || [];
  const results: GmailMessage[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = full.data.payload?.headers || [];
    const subject =
      headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
    const from =
      headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
    const date =
      headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";
    const body = full.data.payload
      ? extractBodyFromPayload(
          full.data.payload as Parameters<typeof extractBodyFromPayload>[0]
        )
      : "";

    results.push({ id: msg.id, subject, from, body, date });
  }

  return results;
}

export async function markAsRead(messageId: string): Promise<void> {
  try {
    const gmail = await getGmailClient();
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        removeLabelIds: ["UNREAD"],
      },
    });
  } catch (error) {
    // If we only have readonly scope, log and continue
    console.warn(
      `Could not mark message ${messageId} as read (may need gmail.modify scope):`,
      error instanceof Error ? error.message : error
    );
  }
}
