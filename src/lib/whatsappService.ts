// ============================================================
// WhatsApp Service — Green API send utility + per-recruiter accounts
// ============================================================
//
// Two kinds of senders:
//   1. The business number (env GREEN_API_INSTANCE_ID / GREEN_API_TOKEN) —
//      used by the AI screening flow and as a fallback.
//   2. A recruiter's personal number — a Green API instance linked by the
//      recruiter under /settings/whatsapp (table whatsapp_accounts). Manual
//      and bulk sends from the CRM go out from the signed-in recruiter's
//      number when one is linked.

import { createHmac, timingSafeEqual } from "crypto";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { checkSendGate } from "@/lib/sendGate";

export type WhatsAppProvider = "greenapi" | "cloud";

export interface WhatsAppAccount {
  instanceId: string;
  token: string;
  /** recruiter email; undefined for the business number */
  userEmail?: string;
  label?: string | null;
  phone?: string | null;
  /** הודעה נכנסת ממספר לא מוכר יוצרת ליד חדש (המספר של מלי) */
  captureUnknown?: boolean;
  /** greenapi = הלקוח הלא רשמי; cloud = הערוץ הרשמי של מטא */
  provider?: WhatsAppProvider;
  /** cloud בלבד: מזהה המספר אצל מטא (לא המספר עצמו) */
  phoneNumberId?: string | null;
  /** cloud בלבד: בסיס API של ספק, ריק = מטא ישירות */
  apiBase?: string | null;
  /** cloud בלבד: שם משתנה הסביבה שמחזיק את הטוקן */
  tokenEnv?: string | null;
  /** cloud בלבד: bearer = מטא ישירות; d360 = 360dialog */
  authStyle?: CloudAuthStyle;
  /** מזהה את החשבון בכתובת ה-webhook הנכנס */
  webhookToken?: string | null;
  /** סוד לאימות webhook נכנס מספק, בכותרת. לא בשימוש בחיבור ישיר למטא */
  webhookSecret?: string | null;
}

export type CloudAuthStyle = "bearer" | "d360";

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** The shared business number from env. */
export function businessAccount(): WhatsAppAccount {
  // .trim(): the Vercel env value carries a trailing newline.
  return {
    instanceId: (process.env.GREEN_API_INSTANCE_ID ?? "").trim(),
    token: (process.env.GREEN_API_TOKEN ?? "").trim(),
    label: "מספר ברירת המחדל",
  };
}

/**
 * המספר הרשמי שממנו יוצאות תזכורות אוטומטיות — מהסביבה, לא מהטבלה.
 *
 * 16.09: businessAccount() הצביע על המספר של חושן, שנמחק מ-GreenAPI
 * ב-14.09. מאותו יום 0 מתוך 20 תזכורות ראיון הגיעו, בשקט, ושיעור
 * האי-הגעה קפץ מ-20% ל-55%. תזכורות יוצאות מחוץ לחלון 24 השעות, ולכן
 * בערוץ הרשמי רק תבנית מאושרת עוברת.
 *
 * לא שורה ב-whatsapp_accounts בכוונה: שורה שם משתתפת בניתוב הודעות
 * נכנסות ובהרשאות צפייה, ומספר תזכורות אינו של אף רכז/ת. תשובות של
 * מועמדים מגיעות לגובגט, שמעביר כל הודעה נכנסת ל-V1 לפני שהוא מחליט
 * לשתוק (R-206) — והליד נשאר של הרכז/ת שלו.
 *
 * null = לא מוגדר, והקורא נשאר עם ההתנהגות הקודמת.
 */
export function officialReminderAccount(): WhatsAppAccount | null {
  const id = (process.env.REMINDER_PHONE_NUMBER_ID ?? "").trim();
  if (!id) return null;
  return {
    instanceId: `cloud:${id}`,
    token: "",
    label: "מספר רשמי — תזכורות",
    provider: "cloud",
    phoneNumberId: id,
    tokenEnv: (process.env.REMINDER_TOKEN_ENV ?? "WHATSAPP_CLOUD_TOKEN_MAIN").trim(),
    authStyle: "bearer",
  };
}

interface AccountRow {
  user_email: string;
  instance_id: string;
  api_token: string;
  phone: string | null;
  label: string | null;
  is_active: boolean;
  capture_unknown?: boolean;
  provider?: string | null;
  phone_number_id?: string | null;
  api_base?: string | null;
  token_env?: string | null;
  auth_style?: string | null;
  webhook_token?: string | null;
  webhook_secret?: string | null;
}

/** העמודות של חשבון — במקום אחד, כדי ששאילתה לא תשכח שדה של ספק. */
const ACCOUNT_COLUMNS =
  "user_email, instance_id, api_token, phone, label, is_active, capture_unknown, provider, phone_number_id, api_base, token_env, auth_style, webhook_token, webhook_secret";

function rowToAccount(r: AccountRow): WhatsAppAccount {
  return {
    instanceId: r.instance_id,
    token: r.api_token,
    userEmail: r.user_email,
    label: r.label,
    phone: r.phone,
    captureUnknown: r.capture_unknown === true,
    provider: r.provider === "cloud" ? "cloud" : "greenapi",
    phoneNumberId: r.phone_number_id ?? null,
    apiBase: r.api_base ?? null,
    tokenEnv: r.token_env ?? null,
    authStyle: r.auth_style === "d360" ? "d360" : "bearer",
    webhookToken: r.webhook_token ?? null,
    webhookSecret: r.webhook_secret ?? null,
  };
}

/** Active personal account linked by this recruiter, or null. */
export async function getAccountForEmail(
  email: string | null | undefined
): Promise<WhatsAppAccount | null> {
  if (!email) return null;
  const { data } = await adminClient()
    .from("whatsapp_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("user_email", email.toLowerCase())
    .eq("is_active", true)
    .maybeSingle();
  return data ? rowToAccount(data as AccountRow) : null;
}

/** Account that owns a Green API instance (personal or business). */
export async function getAccountByInstance(
  instanceId: string | number | null | undefined
): Promise<WhatsAppAccount> {
  const id = instanceId == null ? "" : String(instanceId).trim();
  const biz = businessAccount();
  if (!id) return biz;
  // DB first — the env (default) instance may itself be linked to a recruiter.
  const { data } = await adminClient()
    .from("whatsapp_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("instance_id", id)
    .maybeSingle();
  return data ? rowToAccount(data as AccountRow) : biz;
}

/**
 * החשבון שכתובת ה-webhook הזו שייכת לו. null = טוקן לא מוכר, והבקשה
 * נדחית — אין נפילה חזרה למספר העסקי, כי ניחוש כאן משייך הודעה של
 * מועמד/ת לרכז/ת הלא נכון/ה.
 */
export async function getAccountByWebhookToken(
  token: string | null | undefined
): Promise<WhatsAppAccount | null> {
  const t = (token ?? "").trim();
  if (!t) return null;
  const { data } = await adminClient()
    .from("whatsapp_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("webhook_token", t)
    .eq("is_active", true)
    .maybeSingle();
  return data ? rowToAccount(data as AccountRow) : null;
}

/**
 * המספר שממנו שולח/ת מי שאין לו/ה מספר משלו (בפועל: אדמין).
 *
 * 16.09: businessAccount() הצביע על המספר של חושן, שנמחק מ-GreenAPI
 * ב-14.09 — כל הודעה ידנית של סער נכשלה. סער העביר את ברירת המחדל
 * למספר של תמי (הערוץ הרשמי). ההגדרה היא אימייל של חשבון מחובר, כדי
 * שהחלפה עתידית לא תדרוש קוד. חשבון לא פעיל → חזרה למספר העסקי.
 */
export async function defaultSenderAccount(): Promise<WhatsAppAccount> {
  const email = (process.env.DEFAULT_SENDER_EMAIL ?? "").trim();
  return (email ? await getAccountForEmail(email) : null) ?? businessAccount();
}

/** Sender for the signed-in recruiter: their own number, else the default one. */
export async function resolveSender(
  email: string | null | undefined
): Promise<WhatsAppAccount> {
  return (await getAccountForEmail(email)) ?? (await defaultSenderAccount());
}

/**
 * חשבון שהאציל לרכזת הזו שליחת מסמכים לחתימה (doc_delegates).
 * האצלה ממוקדת: שליחת מסמכים בלבד — בלי צפייה בשיחות של החשבון
 * ובלי שליחת הודעות ידניות ממנו.
 */
export async function getDocDelegateAccount(
  email: string | null | undefined
): Promise<WhatsAppAccount | null> {
  if (!email) return null;
  const { data } = await adminClient()
    .from("whatsapp_accounts")
    .select(ACCOUNT_COLUMNS)
    .contains("doc_delegates", JSON.stringify([email.toLowerCase()]))
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return data ? rowToAccount(data as AccountRow) : null;
}

/**
 * Convert a phone string to Green API chatId format.
 * Strips non-digits, converts Israeli 05x → 9725x, appends @c.us.
 */
export function formatChatId(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = "972" + digits.slice(1);
  }
  return digits + "@c.us";
}

/**
 * Extract a local Israeli phone number from a Green API chatId.
 * "972501234567@c.us" → "0501234567"
 */
export function phoneFromChatId(chatId: string): string {
  const digits = chatId.replace(/@c\.us$/, "");
  if (digits.startsWith("972")) {
    return "0" + digits.slice(3);
  }
  return digits;
}

export interface SendResult {
  success: boolean;
  idMessage?: string;
  error?: string;
  /** השליחה נחסמה בשער (opt-out / שעות שקט) — לא כשל טכני */
  blocked?: "do_not_contact" | "quiet_hours";
  /** ערוץ רשמי: המועמד/ת לא כתבו למספר הזה ב-24 השעות האחרונות */
  windowClosed?: boolean;
}

export interface SendOptions {
  /** הודעה שהמערכת יוזמת (בוט, cron, תזכורת) — כפופה גם לשעות שקט */
  automated?: boolean;
  /** עוקף את השער — רק לאישור ה-opt-out עצמו */
  skipGate?: boolean;
}

function apiUrl(account: WhatsAppAccount, method: string): string {
  return `https://api.green-api.com/waInstance${account.instanceId}/${method}/${account.token}`;
}

// ── הערוץ הרשמי של מטא (coexistence) ────────────────────────
//
// בערוץ הרשמי מותר טקסט חופשי רק בתוך 24 שעות מההודעה האחרונה של
// המועמד/ת. מחוץ לחלון מטא דוחה את ההודעה, ורק תבנית מאושרת עוברת.
//
// לרכזת יש דרך עוקפת שאין לבוט: האפליקציה בטלפון שלה. מטא קובעת
// במפורש שהודעה שנשלחת מ-WhatsApp Business אינה כפופה לחלון — ולכן
// כשהחלון סגור התשובה הנכונה היא לומר לה בדיוק את זה, ולא להיכשל
// בשקט או להמציא תבנית.

export const SERVICE_WINDOW_HOURS = 24;

/**
 * מתי המועמד/ת כתבו לאחרונה — או null אם מעולם לא, או שהבדיקה נכשלה.
 *
 * instanceId: החלון של מטא נפתח לכל מספר עסקי בנפרד. מועמד שענה לבוט
 * (050-700-8171) לא פתח חלון אצל תמי — בלי הסינון V1 היה מאשר את
 * השליחה ומטא הייתה מכשילה אותה אחר כך.
 */
export async function lastInboundAt(phone: string, instanceId?: string): Promise<string | null> {
  const digits = phone.replace(/\D/g, "").replace(/^972/, "0").slice(-10);
  if (!digits) return null;
  const db = adminClient();
  const { data: lead } = await db
    .from("leads")
    .select("id")
    .eq("phone", digits)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lead) return null;
  let query = db
    .from("messages")
    .select("created_at")
    .eq("lead_id", lead.id)
    .eq("role", "user");
  if (instanceId) query = query.eq("via_instance", instanceId);
  const { data: msg } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (msg?.created_at as string) ?? null;
}

export function isWithinServiceWindow(
  last: string | null,
  now: Date = new Date()
): boolean {
  if (!last) return false;
  const ms = now.getTime() - new Date(last).getTime();
  return ms >= 0 && ms < SERVICE_WINDOW_HOURS * 3_600_000;
}

/**
 * שני ספקים, שני מבנים. מטא מזהה את המספר בנתיב ומאמתת ב-Bearer;
 * 360dialog מזהה אותו לפי מפתח ה-API ולכן הנתיב הוא /messages בלבד,
 * והאימות בכותרת ייעודית. גוף הבקשה זהה בשניהם.
 */
export function cloudRequest(
  account: WhatsAppAccount,
  token: string
): { url: string; headers: Record<string, string> } {
  const d360 = account.authStyle === "d360";
  const base =
    (account.apiBase ?? "").trim() ||
    (d360 ? "https://waba-v2.360dialog.io" : "https://graph.facebook.com/v21.0");
  const root = base.replace(/\/+$/, "");
  return {
    url: d360 ? `${root}/messages` : `${root}/${account.phoneNumberId}/messages`,
    headers: {
      "Content-Type": "application/json",
      ...(d360 ? { "D360-API-KEY": token } : { Authorization: `Bearer ${token}` }),
    },
  };
}

/**
 * מטא חותמת כל בקשה ב-HMAC-SHA256 על גוף הבקשה עם App Secret של
 * האפליקציה. זו שכבת האבטחה היחידה שאי אפשר לזייף — הטוקן שבכתובת
 * רק מנתב. בלי App Secret מוגדר מחזירים false ולא "אולי זו מטא":
 * webhook פתוח הוא בדיוק מה שנסגר כאן בדיעבד ב-00088.
 *
 * ההשוואה ב-timingSafeEqual ולא ב-===, כדי לא לדלוף את החתימה
 * הנכונה בהפרשי זמן.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  const digest = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * אימות webhook שמגיע מספק ולא ממטא. אין חתימה על הגוף — הספק מקבל
 * את ההודעה ממטא ושולח אותה הלאה מהשרתים שלו — ולכן כל מה שיש הוא
 * סוד משותף שקבענו על ה-webhook אצלו, בכותרת Authorization.
 *
 * חלש יותר מחתימה: מי שמחזיק בסוד יכול להמציא הודעה. לכן הסוד לעולם
 * לא בכתובת אלא בכותרת בלבד, וסוד ריק נדחה ולא "עובר כי אין מה לבדוק".
 */
export function verifyBearerSecret(
  header: string | null,
  secret: string | null | undefined
): boolean {
  const expected = (secret ?? "").trim();
  if (!expected || !header) return false;
  const got = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
  const a = Buffer.from(got, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function sendViaCloud(
  phone: string,
  message: string,
  account: WhatsAppAccount
): Promise<SendResult> {
  const token = (process.env[account.tokenEnv ?? ""] ?? "").trim();
  if (!token) {
    return { success: false, error: `חסר טוקן בסביבה (${account.tokenEnv ?? "—"})` };
  }
  // בחיבור ישיר למטא המזהה הוא חלק מהנתיב; אצל ספק הוא מיותר
  if (account.authStyle !== "d360" && !account.phoneNumberId) {
    return { success: false, error: "לחשבון הרשמי חסר Phone Number ID" };
  }

  if (!isWithinServiceWindow(await lastInboundAt(phone, account.instanceId))) {
    return {
      success: false,
      windowClosed: true,
      error:
        "חלון 24 השעות סגור — המועמד/ת לא כתבו למספר הזה ביממה האחרונה. " +
        "אפשר לכתוב להם מאפליקציית WhatsApp Business בטלפון (שם אין מגבלה), " +
        "וההודעה תופיע כאן אוטומטית.",
    };
  }

  // מטא מצפה למספר בפורמט בינלאומי בלי + ובלי סיומת
  const to = phone.replace(/\D/g, "").replace(/^0/, "972");

  const req = cloudRequest(account, token);

  try {
    const res = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: message, preview_url: false },
      }),
    });
    const body = await res.json();
    if (res.ok) {
      return { success: true, idMessage: body?.messages?.[0]?.id };
    }
    return { success: false, error: body?.error?.message ?? JSON.stringify(body) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface TemplateMessage {
  /** שם התבנית כפי שאושרה אצל מטא */
  name: string;
  language: string;
  /** פרמטרים לגוף, לפי הסדר {{1}}, {{2}}… */
  params: string[];
}

/**
 * הודעה יזומה מחוץ לחלון 24 השעות — בערוץ הרשמי רק תבנית מאושרת עוברת.
 *
 * פרמטר ריק נדחה כאן ולא אצל מטא: מטא דוחה אותו ממילא, אבל בשגיאה כללית
 * שקשה לקשר לסיבה. עדיף שהכשל יגיד בדיוק מה חסר.
 */
export async function sendWhatsAppTemplate(
  phone: string,
  template: TemplateMessage,
  account: WhatsAppAccount,
  opts: SendOptions = {}
): Promise<SendResult> {
  if (!opts.skipGate) {
    const gate = await checkSendGate(phone, { automated: opts.automated === true });
    if (!gate.allowed) {
      return { success: false, error: gate.error, blocked: gate.reason };
    }
  }

  // ל-GreenAPI אין תבניות — שם אין חלון, ושולחים טקסט רגיל.
  if (account.provider !== "cloud") {
    return { success: false, error: "תבניות קיימות רק בערוץ הרשמי" };
  }
  if (template.params.some((p) => !p || !p.trim())) {
    return { success: false, error: `פרמטר ריק בתבנית ${template.name}` };
  }

  const token = (process.env[account.tokenEnv ?? ""] ?? "").trim();
  if (!token) {
    return { success: false, error: `חסר טוקן בסביבה (${account.tokenEnv ?? "—"})` };
  }
  if (account.authStyle !== "d360" && !account.phoneNumberId) {
    return { success: false, error: "לחשבון הרשמי חסר Phone Number ID" };
  }

  const to = phone.replace(/\D/g, "").replace(/^0/, "972");
  const req = cloudRequest(account, token);

  try {
    const res = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language },
          ...(template.params.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: template.params.map((text) => ({ type: "text", text })),
                  },
                ],
              }
            : {}),
        },
      }),
    });
    const body = await res.json();
    if (res.ok) {
      return { success: true, idMessage: body?.messages?.[0]?.id };
    }
    return { success: false, error: body?.error?.message ?? JSON.stringify(body) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send a WhatsApp message via Green API from the given account
 * (defaults to the business number).
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  account: WhatsAppAccount = businessAccount(),
  opts: SendOptions = {}
): Promise<SendResult> {
  // שער השליחה (שלב 2 בתוכנית העבודה): opt-out חוסם כל שליחה,
  // שעות שקט חוסמות שליחה אוטומטית. נאכף כאן כדי שאף מסלול — ידני,
  // ברוכת, cron או בוט — לא יוכל לעקוף אותו.
  if (!opts.skipGate) {
    const gate = await checkSendGate(phone, { automated: opts.automated === true });
    if (!gate.allowed) {
      return { success: false, error: gate.error, blocked: gate.reason };
    }
  }

  // נקודת הפיצול בין הספקים. כל 18 מסלולי השליחה במערכת עוברים כאן,
  // ולכן די בהחלפת ה-provider בשורת החשבון כדי שרכזת תעבור לערוץ הרשמי.
  if (account.provider === "cloud") {
    return sendViaCloud(phone, message, account);
  }

  const chatId = formatChatId(phone);

  try {
    const res = await fetch(apiUrl(account, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });

    const body = await res.json();

    if (res.ok) {
      return { success: true, idMessage: body.idMessage };
    }
    return { success: false, error: JSON.stringify(body) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Is this number on WhatsApp at all? Used to explain a failed manual send:
 * "the recruiter's WhatsApp is disconnected" and "this candidate has no
 * WhatsApp" are different problems with different fixes. Returns null when
 * the check itself fails (don't guess).
 */
export async function checkWhatsappExists(
  phone: string,
  account: WhatsAppAccount = businessAccount()
): Promise<boolean | null> {
  // הערוץ הרשמי לא חושף בדיקה כזו — מטא לא מאפשרת לברר אם מספר קיים
  // בוואטסאפ בלי לשלוח אליו. null = "לא יודע", וזו התשובה הכנה.
  if (account.provider === "cloud") return null;

  const digits = formatChatId(phone).replace(/@c\.us$/, "");
  try {
    const res = await fetch(apiUrl(account, "checkWhatsapp"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: Number(digits) }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { existsWhatsapp?: boolean };
    return typeof body.existsWhatsapp === "boolean" ? body.existsWhatsapp : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// Instance management (used by /settings/whatsapp)
// ------------------------------------------------------------

export type InstanceState =
  | "authorized"
  | "notAuthorized"
  | "blocked"
  | "sleepMode"
  | "starting"
  | "yellowCard"
  | "unknown";

/** Green API getStateInstance. Throws on bad credentials / network. */
export async function getInstanceState(
  account: WhatsAppAccount
): Promise<InstanceState> {
  // בערוץ הרשמי אין "מכשיר מחובר" שאפשר לנתק — המספר רשום אצל מטא
  // וזמין כל עוד החשבון תקין. מסך ההגדרות מציג אותו כמחובר במקום
  // לזרוק שגיאה של GreenAPI על חשבון שאינו שלו.
  if (account.provider === "cloud") return "authorized";

  const res = await fetch(apiUrl(account, "getStateInstance"), {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Green API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { stateInstance?: string };
  return (body.stateInstance as InstanceState) ?? "unknown";
}

/** Linked phone number of the instance ("972541234567") or null. */
export async function getInstancePhone(
  account: WhatsAppAccount
): Promise<string | null> {
  try {
    const res = await fetch(apiUrl(account, "getWaSettings"), { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { phone?: string };
    return body.phone ?? null;
  } catch {
    return null;
  }
}

/**
 * QR code for linking the phone (only meaningful while notAuthorized).
 * Returns a data: URL, or null if the instance is already authorized /
 * not ready yet.
 */
export async function getInstanceQr(
  account: WhatsAppAccount
): Promise<{ qr: string | null; message?: string }> {
  const res = await fetch(apiUrl(account, "qr"), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Green API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { type?: string; message?: string };
  if (body.type === "qrCode" && body.message) {
    return { qr: `data:image/png;base64,${body.message}` };
  }
  return { qr: null, message: body.message };
}

/**
 * Point the instance's webhook at our CRM so inbound messages (and
 * messages the recruiter sends from their phone) reach the lead's chat.
 */
export async function configureInstanceWebhook(
  account: WhatsAppAccount,
  webhookUrl: string
): Promise<void> {
  const res = await fetch(apiUrl(account, "setSettings"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl,
      // GreenAPI מחזירה את הטוקן בכותרת Authorization של כל webhook —
      // וה-route שלנו דוחה בקשות בלעדיו (כשה-env מוגדר).
      webhookUrlToken: (process.env.GREEN_API_WEBHOOK_TOKEN ?? "").trim(),
      incomingWebhook: "yes",
      outgoingWebhook: "yes",
      outgoingAPIMessageWebhook: "no",
      stateWebhook: "no",
      markIncomingMessagesReaded: "no",
    }),
  });
  if (!res.ok) {
    throw new Error(`Green API setSettings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

/** Log out the phone from the instance (so a different number can be linked). */
export async function logoutInstance(account: WhatsAppAccount): Promise<void> {
  await fetch(apiUrl(account, "logout"), { cache: "no-store" }).catch(() => {});
}
