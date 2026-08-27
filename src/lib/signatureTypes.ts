// סטטוס בקשת חתימה דיגיטלית — משותף לדשבורד ולדף החתימה הציבורי.
// מופרד מקבצי "use server" מאותה סיבה כמו leadDocTypes.ts.

export type SignatureStatus = "pending" | "signed" | "cancelled";

export interface SignatureRequest {
  id: string;
  lead_id: string;
  document_id: string | null;
  signed_document_id: string | null;
  token: string;
  status: SignatureStatus;
  doc_type: string;
  file_name: string;
  sent_by: string | null;
  sent_at: string;
  expires_at: string;
  signer_name: string | null;
  signed_at: string | null;
}

/** MIME types שאפשר לשלוח לחתימה (מוטבעים ל-PDF בשרת). */
export const SIGNABLE_MIMES = ["application/pdf", "image/png", "image/jpeg"];

export function isSignableMime(mime: string | null | undefined): boolean {
  return !!mime && SIGNABLE_MIMES.includes(mime);
}

// ── שדות פרטי מועמד ──────────────────────────────────────────
// כל בקשת חתימה נושאת רשימת שדות חובה; המועמד לא יכול לחתום
// עד שכולם מלאים ותקינים. הערכים נשמרים ב-lead_candidate_details.

export interface CandidateFieldDef {
  label: string;
  /** input type בדף החתימה */
  type: "text" | "tel" | "email" | "date";
  /** inputmode נומרי (ת"ז, חשבון בנק) */
  numeric?: boolean;
}

export const CANDIDATE_FIELDS = {
  full_name:    { label: "שם מלא",          type: "text" },
  id_number:    { label: "תעודת זהות",      type: "tel", numeric: true },
  birth_date:   { label: "תאריך לידה",      type: "date" },
  address:      { label: "כתובת מגורים",    type: "text" },
  phone:        { label: "טלפון נייד",      type: "tel", numeric: true },
  email:        { label: "אימייל",          type: "email" },
  bank_name:    { label: "בנק",             type: "text" },
  bank_branch:  { label: "מספר סניף",       type: "tel", numeric: true },
  bank_account: { label: "מספר חשבון",      type: "tel", numeric: true },
} as const satisfies Record<string, CandidateFieldDef>;

export type CandidateFieldKey = keyof typeof CANDIDATE_FIELDS;

export const DEFAULT_REQUIRED_FIELDS: CandidateFieldKey[] = ["full_name", "id_number"];

/** בדיקת ספרת ביקורת של תעודת זהות ישראלית. */
export function isValidIsraeliId(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 9) return false;
  const padded = digits.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(padded[i]) * (i % 2 === 0 ? 1 : 2);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

/** ולידציה של ערך שדה יחיד (כולל שדות מותאמים); מחזיר הודעת שגיאה או null. */
export function validateCandidateField(key: string, value: string): string | null {
  const v = value.trim();
  if (!v) return "שדה חובה";
  switch (key) {
    case "full_name":
      return v.length >= 2 && v.length <= 80 ? null : "נא למלא שם מלא";
    case "id_number":
      return isValidIsraeliId(v) ? null : "מספר תעודת זהות לא תקין";
    case "phone":
      return /^0\d{8,9}$/.test(v.replace(/[\s-]/g, "")) ? null : "מספר טלפון לא תקין";
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "כתובת אימייל לא תקינה";
    case "birth_date":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : "נא לבחור תאריך";
    case "bank_branch":
    case "bank_account":
      return /^\d{1,12}$/.test(v.replace(/[\s-]/g, "")) ? null : "נא למלא ספרות בלבד";
    default:
      return v.length <= 120 ? null : "ארוך מדי";
  }
}

// ── שדות רכזת ────────────────────────────────────────────────
// ערכים שהרכזת ממלאת בזמן השליחה (תנאי ההעסקה שסוכמו) — המועמד
// רואה אותם לקריאה בלבד והם מוטבעים בטופס כמו שאר השדות.

export const RECRUITER_FIELDS = {
  job_title:   { label: "תפקיד" },
  workplace:   { label: "מקום עבודה" },
  hourly_wage: { label: "שכר שעתי (₪)" },
} as const;

export type RecruiterFieldKey = keyof typeof RECRUITER_FIELDS;

export function sanitizeRecruiterFields(raw: unknown): RecruiterFieldKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (k): k is RecruiterFieldKey => typeof k === "string" && k in RECRUITER_FIELDS
  );
}

/**
 * ערכי רכזת מהקלט — מפתחות מוכרים (+ מפתחות מותאמים מורשים),
 * טקסט קצוץ, בלי ריקים.
 */
export function sanitizeRecruiterValues(
  raw: unknown,
  extraKeys: string[] = []
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if ((k in RECRUITER_FIELDS || extraKeys.includes(k)) && typeof v === "string" && v.trim()) {
      out[k] = v.trim().slice(0, 120);
    }
  }
  return out;
}

// ── מיקומי שדות על גבי המסמך (ממופים בכלי הסימון) ────────────

/** מפתחות שאפשר למקם על המסמך: שדות מועמד + שדות רכזת + חתימה + תאריך. */
// ── שדות מותאמים אישית ───────────────────────────────────────
// מוגדרים בכלי המיפוי (לא בקוד). filler קובע מי ממלא את הערך.

export interface CustomFieldDef {
  /** custom_<slug> — נוצר ע"י כלי המיפוי */
  key: string;
  label: string;
  filler: "candidate" | "recruiter";
  /** "choice" = שאלת סימון: בוחרים אפשרות וה-✓ מוטבע במשבצת שלה */
  type?: "text" | "choice";
  options?: string[];
}

export const CUSTOM_KEY_RE = /^custom_[a-z0-9_]{1,40}$/;
/** משבצת של אפשרות בשאלת סימון: <key>__<אינדקס אפשרות> */
export const CHOICE_PLACEMENT_RE = /^custom_[a-z0-9_]{1,40}__\d{1,2}$/;

export function sanitizeCustomFields(raw: unknown): CustomFieldDef[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomFieldDef[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const { key, label, filler, type, options } = c as Record<string, unknown>;
    if (typeof key !== "string" || !CUSTOM_KEY_RE.test(key) || seen.has(key)) continue;
    if (typeof label !== "string" || !label.trim() || label.length > 60) continue;
    if (filler !== "candidate" && filler !== "recruiter") continue;
    const def: CustomFieldDef = { key, label: label.trim(), filler };
    if (type === "choice") {
      if (!Array.isArray(options)) continue;
      const opts = options
        .filter((o): o is string => typeof o === "string" && !!o.trim() && o.length <= 40)
        .map((o) => o.trim())
        .slice(0, 12);
      if (opts.length < 2) continue;
      def.type = "choice";
      def.options = opts;
    }
    seen.add(key);
    out.push(def);
    if (out.length >= 40) break;
  }
  return out;
}

export type PlacementKey =
  | CandidateFieldKey
  | RecruiterFieldKey
  | "signature"
  | "date"
  | `custom_${string}`;

export interface FieldPlacement {
  key: PlacementKey;
  /** עמוד 1-based */
  page: number;
  /** קואורדינטות מנורמלות 0-1; y נמדד מלמעלה */
  x: number;
  y: number;
  w: number;
  h: number;
}

export function isPlacementKey(k: unknown): k is PlacementKey {
  return (
    typeof k === "string" &&
    (k in CANDIDATE_FIELDS ||
      k in RECRUITER_FIELDS ||
      k === "signature" ||
      k === "date" ||
      CUSTOM_KEY_RE.test(k) ||
      CHOICE_PLACEMENT_RE.test(k))
  );
}

/** מסנן מערך מיקומים מה-DB/קלט למבנה תקין בלבד. */
export function sanitizeFieldPositions(raw: unknown): FieldPlacement[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldPlacement[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const { key, page, x, y, w, h } = p as Record<string, unknown>;
    if (!isPlacementKey(key)) continue;
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 50) continue;
    const nums = [x, y, w, h];
    if (!nums.every((n) => typeof n === "number" && n >= 0 && n <= 1)) continue;
    if ((w as number) <= 0 || (h as number) <= 0) continue;
    out.push({ key, page, x: x as number, y: y as number, w: w as number, h: h as number });
    if (out.length >= 60) break;
  }
  return out;
}

/** מסנן רשימת שדות מה-DB לשדות מוכרים בלבד. */
export function sanitizeRequiredFields(raw: unknown): CandidateFieldKey[] {
  if (!Array.isArray(raw)) return DEFAULT_REQUIRED_FIELDS;
  const known = raw.filter((k): k is CandidateFieldKey => typeof k === "string" && k in CANDIDATE_FIELDS);
  return known.length > 0 ? known : DEFAULT_REQUIRED_FIELDS;
}
