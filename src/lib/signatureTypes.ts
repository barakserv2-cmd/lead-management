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

/** ולידציה של ערך שדה יחיד; מחזיר הודעת שגיאה או null. */
export function validateCandidateField(key: CandidateFieldKey, value: string): string | null {
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

/** מסנן רשימת שדות מה-DB לשדות מוכרים בלבד. */
export function sanitizeRequiredFields(raw: unknown): CandidateFieldKey[] {
  if (!Array.isArray(raw)) return DEFAULT_REQUIRED_FIELDS;
  const known = raw.filter((k): k is CandidateFieldKey => typeof k === "string" && k in CANDIDATE_FIELDS);
  return known.length > 0 ? known : DEFAULT_REQUIRED_FIELDS;
}
