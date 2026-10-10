// ============================================================
// ליד מטופס לידים של Meta → ליד ב-v1 (פיילוט פייסבוק פנימי, 6.10)
//
// Make שולח את הליד כמו ש-Meta מחזירה אותו: מזהים (ליד, טופס, קמפיין,
// קבוצת מודעות, מודעה) ו-field_data — רשימת שדות {name, values[]}.
// הקובץ טהור: פירוק, נרמול וסינון ראשוני, בלי DB, כדי שאפשר לבדוק אותו.
//
// הסינון כאן הוא רק לפי מה שהמועמד/ת ענה/תה בטופס. "מועמד רלוונטי"
// נקבע בשיחה ע"י רכזת — screening_passed הוא רמז לסדר טיפול, לא החלטה.
// ============================================================

import { normalizePhone } from "@/lib/phone";

/** מפתחות השאלות כפי שהוגדרו בטופס (שדה "key" של שאלה מותאמת ב-Meta). */
export const SCREENING_KEYS = ["role", "over_18", "weekends", "availability", "arrival", "eilat_ok"] as const;
export type ScreeningKey = (typeof SCREENING_KEYS)[number];
export type ScreeningAnswers = Partial<Record<ScreeningKey, string>>;

const SCREENING_LABELS: Record<ScreeningKey, string> = {
  role: "תפקיד מבוקש",
  over_18: "18 ומעלה",
  weekends: "סופי שבוע",
  availability: "זמינות",
  arrival: "מתי מגיע/ה",
  eilat_ok: "מבין/ה שהעבודה באילת",
};

export type MetaLead = {
  leadgenId: string;
  createdAt: string | null;
  formId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adId: string | null;
  adName: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  answers: ScreeningAnswers;
};

type FieldData = { name?: unknown; values?: unknown }[];

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/**
 * בטופס בעברית Meta יוצרת את מפתחות השדות מהטקסט של השאלה
 * ("האם_את/ה_בן/בת_18_ומעלה?", "מספר_טלפון"), ואת הערכים ממפתחות
 * התשובות ("פחות_מחודש"). כאן ממפים אותם למפתחות הקבועים.
 */
const HEBREW_KEYS: [RegExp, string][] = [
  [/^שם_מלא$/, "full_name"],
  [/^שם_פרטי$/, "first_name"],
  [/^שם_משפחה$/, "last_name"],
  [/^מספר_טלפון$/, "phone_number"],
  [/^(אימייל|דוא"ל|כתובת_אימייל)$/, "email"],
  [/תפקיד/, "role"],
  [/18/, "over_18"],
  [/סופי_שבוע/, "weekends"],
  [/לכמה_זמן/, "availability"],
  [/להגיע/, "arrival"],
  [/באילת/, "eilat_ok"],
];

function canonicalKey(name: string): string {
  for (const [re, key] of HEBREW_KEYS) if (re.test(name)) return key;
  return name;
}

/** field_data של Meta → מפה שם→ערך ראשון. */
function fieldMap(fd: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!Array.isArray(fd)) return out;
  for (const f of fd as FieldData) {
    const name = str(f?.name)?.toLowerCase();
    const first = Array.isArray(f?.values) ? str(f.values[0]) : str(f?.values);
    if (!name || !first) continue;
    const key = canonicalKey(name);
    if (!out.has(key)) out.set(key, key === "email" ? first : first.replace(/_/g, " "));
  }
  return out;
}

export type ParseResult = { ok: true; lead: MetaLead } | { ok: false; error: string };

/**
 * מקבל את גוף הבקשה מ-Make. תומך גם בשדות שטוחים (full_name, phone_number,
 * answers{}) למקרה ש-Make ממפה ידנית, וגם ב-field_data הגולמי.
 */
export function parseMetaLead(body: unknown): ParseResult {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;

  const leadgenId = str(b.leadgen_id) ?? str(b.id);
  if (!leadgenId) return { ok: false, error: "leadgen_id is required" };

  const fields = fieldMap(b.field_data);
  const flatAnswers = (b.answers && typeof b.answers === "object" ? b.answers : {}) as Record<string, unknown>;

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = str(b[k]) ?? str(flatAnswers[k]) ?? fields.get(k) ?? null;
      if (v) return v;
    }
    return null;
  };

  const name =
    pick("full_name", "name") ??
    ([pick("first_name"), pick("last_name")].filter(Boolean).join(" ") || null);
  const rawPhone = pick("phone_number", "phone");
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (!phone) return { ok: false, error: "phone is required" };

  const answers: ScreeningAnswers = {};
  for (const k of SCREENING_KEYS) {
    const v = pick(k);
    if (v) answers[k] = v.replace(/_/g, " ");
  }

  return {
    ok: true,
    lead: {
      leadgenId,
      createdAt: str(b.created_time),
      formId: str(b.form_id),
      campaignId: str(b.campaign_id),
      campaignName: str(b.campaign_name),
      adsetId: str(b.adset_id),
      adId: str(b.ad_id),
      adName: str(b.ad_name),
      name,
      phone,
      email: pick("email"),
      answers,
    },
  };
}

const YES = /^(כן|yes|true)$/i;

export type Screening = { passed: boolean; failed: ScreeningKey[]; missing: ScreeningKey[] };

/**
 * ההגדרה של סער (6.10): 18+, סופי שבוע, חודש לפחות, זמין/ה להגיע מיד,
 * מבין/ה שהעבודה באילת. ניסיון לא נדרש. "מיד" = השבוע.
 * שאלה שלא נענתה לא נחשבת כישלון אבל מונעת "עבר".
 */
export function evaluateScreening(a: ScreeningAnswers): Screening {
  const failed: ScreeningKey[] = [];
  const missing: ScreeningKey[] = [];
  const check = (k: ScreeningKey, ok: (v: string) => boolean) => {
    const v = a[k];
    if (!v) missing.push(k);
    else if (!ok(v)) failed.push(k);
  };
  check("over_18", (v) => YES.test(v));
  check("weekends", (v) => YES.test(v));
  check("availability", (v) => !/פחות מחודש/.test(v));
  check("arrival", (v) => /השבוע/.test(v));
  check("eilat_ok", (v) => YES.test(v));
  return { passed: failed.length === 0 && missing.length === 0, failed, missing };
}

/** הערה קריאה לרכזת: התשובות מהטופס והמודעה שממנה הגיע/ה. */
export function screeningNote(lead: MetaLead, s: Screening): string {
  const lines = SCREENING_KEYS.filter((k) => lead.answers[k]).map(
    (k) => `${SCREENING_LABELS[k]}: ${lead.answers[k]}${s.failed.includes(k) ? " ✗" : ""}`
  );
  const head = s.passed
    ? "טופס פייסבוק: עבר סינון ראשוני (לאמת בשיחה)"
    : s.failed.length
      ? "טופס פייסבוק: לא עומד בתנאים שסומנו ✗"
      : "טופס פייסבוק: חסרות תשובות";
  const ad = [lead.campaignName, lead.adName].filter(Boolean).join(" · ");
  return [head, ...lines, ad ? `מודעה: ${ad}` : null].filter(Boolean).join("\n");
}

/** המקור בפורמט שכבר מוכר ל-leadChannel ("פייסבוק - <קמפיין>"). */
export function metaLeadSource(lead: MetaLead): string {
  return lead.campaignName ? `פייסבוק - ${lead.campaignName}` : "פייסבוק";
}
