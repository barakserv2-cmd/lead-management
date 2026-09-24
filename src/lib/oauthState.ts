import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * חתימת state לזרימת OAuth של Gmail.
 *
 * סריקת אבטחה 24.09: `/api/auth/gmail/authorize` ו-`/api/auth/gmail/callback`
 * היו ציבוריים לגמרי, ולקולבק לא היה `state`. המשמעות המעשית: אדם זר יכול
 * היה לפתוח בעצמו את זרימת ההרשאה מול גוגל, לקבל `code` לחשבון הג'ימייל
 * *שלו*, ולקרוא לקולבק שלנו — והטוקנים שלו היו נכתבים לטבלת `settings` עם
 * service-role. מאותו רגע סורק הלידים של AllJobs היה קורא את התיבה שלו:
 * או שהוא נשבר, או שהוא מזריק "לידים" שהתוקף שולח לעצמו.
 *
 * ה-state נחתם ב-HMAC על סוד השרת, קשור לכתובת שפתחה את הזרימה, וקצר-מועד.
 * זה אינו מחליף את בדיקת ההתחברות — שתיהן נדרשות.
 */

const TTL_MS = 10 * 60_000;

function secret(): string {
  // אין מפתח ייעודי → נשענים על סוד שרת שכבר קיים. בלי אף אחד מהם אין
  // חתימה אפשרית, והזרימה נחסמת (fail closed) במקום לרוץ בלי הגנה.
  const s = process.env.OAUTH_STATE_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("no server secret available to sign the OAuth state");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

const enc = (s: string) => Buffer.from(s, "utf8").toString("base64url");

/**
 * state = <nonce>.<issuedAt>.<base64url(email)>.<hmac>
 *
 * הכתובת מקודדת ולא נכתבת כמות שהיא: כתובת מייל מכילה נקודות, והן היו
 * שוברות את הפיצול לארבעה חלקים — כל state תקין היה נדחה.
 */
export function createOAuthState(email: string): string {
  const payload = `${randomBytes(16).toString("base64url")}.${Date.now()}.${enc(email.trim().toLowerCase())}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * `email` — מי שחזר מגוגל, לפי העוגייה שלנו. state שנפתח על ידי מישהו אחר
 * נדחה גם אם הוא חתום ובתוקף.
 */
export function verifyOAuthState(
  state: string | null,
  email: string,
  now: number = Date.now()
): boolean {
  if (!state || !email) return false;
  // בלי סוד אי אפשר לאמת — דוחים, ולא מפילים את הקולבק ל-500.
  try { secret(); } catch { return false; }

  const parts = state.split(".");
  if (parts.length !== 4) return false;
  const [nonce, issuedAt, encodedEmail, mac] = parts;
  if (!nonce || !issuedAt || !encodedEmail || !mac) return false;

  const age = now - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > TTL_MS) return false;

  if (encodedEmail !== enc(email.trim().toLowerCase())) return false;

  const expected = sign(`${nonce}.${issuedAt}.${encodedEmail}`);
  // אורך שונה מפיל את timingSafeEqual, ולכן נבדק לפניו
  if (expected.length !== mac.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(mac));
}
