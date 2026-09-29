// ── פנייה מהאתר הציבורי (site/) ──────────────────────────────
// האתר הסטטי שולח לכאן את הטופס בלי מפתח API (אי אפשר לשמור סוד בדף
// סטטי), ולכן כל שדה נבדק ונחתך כאן, יש מלכודת בוטים (honeypot) ומגבלת
// קצב, ורק origin מורשה מקבל CORS. הפונקציות כאן טהורות כדי שאפשר יהיה
// לבדוק אותן בלי שרת.

import { normalizePhone, isCanonicalIlPhone } from "./phone";
import { detectSourceFromUtm } from "./utmSource";

/** גורם הגיוס לליד שהגיע מהאתר החדש בלי קמפיין ממומן. */
export const NEW_SITE_SOURCE = "אתר חדש";

export interface PublicLeadInput {
  name: string;
  phone: string;
  interest: string | null;
  start: string | null;
  page: string | null;
  /** גרסת נוסח ההסכמה שהוצג מתחת לטופס (ראיה לפי תיקון 13) */
  consentVersion: string | null;
  utm: { source: string | null; medium: string | null; campaign: string | null };
}

export type PublicLeadResult =
  | { ok: true; lead: PublicLeadInput }
  | { ok: false; error: "bot" | "consent" | "name" | "phone" };

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

/** בודק ומנקה את גוף הבקשה מהטופס. לא זורק. */
export function parsePublicLead(body: unknown): PublicLeadResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  // שדה שמוסתר מאנשים; בוט שממלא הכול ממלא גם אותו
  if (typeof b.company === "string" && b.company.trim() !== "") return { ok: false, error: "bot" };
  if (b.consent !== true) return { ok: false, error: "consent" };

  const name = clip(b.name, 60);
  if (!name || name.length < 2) return { ok: false, error: "name" };

  const phone = normalizePhone(clip(b.phone, 20));
  if (!phone || !isCanonicalIlPhone(phone)) return { ok: false, error: "phone" };

  const utm = (b.utm && typeof b.utm === "object" ? b.utm : {}) as Record<string, unknown>;
  return {
    ok: true,
    lead: {
      name,
      phone,
      interest: clip(b.interest, 40),
      start: clip(b.start, 20),
      page: clip(b.page, 200),
      consentVersion: clip(b.consent_version, 20),
      utm: {
        source: clip(utm.source, 60),
        medium: clip(utm.medium, 60),
        campaign: clip(utm.campaign, 100),
      },
    },
  };
}

/** קמפיין ממומן מזוהה לפי אותם כללים של טפסי האתר הישן, אחרת "אתר חדש". */
export function sourceForPublicLead(utm: PublicLeadInput["utm"]): string {
  if (!utm.source) return NEW_SITE_SOURCE;
  const paid = detectSourceFromUtm(`utm_source: ${utm.source} utm_medium: ${utm.medium ?? ""}`);
  return paid ?? NEW_SITE_SOURCE;
}

/** origin מורשה לפי PUBLIC_SITE_ORIGINS (רשימה מופרדת בפסיקים). */
export function isAllowedOrigin(origin: string | null, allowList: string | undefined): boolean {
  if (!origin) return false;
  const allowed = (allowList ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin);
}

// ── מגבלת קצב פשוטה, לכל מופע שרת ─────────────────────────────
// לא הגנה מלאה (כל מופע של Vercel מחזיק מונה משלו), אבל עוצרת הצפה
// מכתובת אחת. 5 פניות ב-10 דקות לכתובת.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

export function rateLimited(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}
