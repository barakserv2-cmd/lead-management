// Phone normalization — mirrors normalize_phone() in migration 00047 so the
// app can pre-check duplicates and produce friendly errors before the DB
// trigger + UNIQUE(phone) index reject the write.
//
// Canonical Israeli form: 10 digits, no punctuation ("0501234567").

const SENTINEL = /^(no-phone-|anon-)/;

export function normalizePhone(input: string | null | undefined): string | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (SENTINEL.test(raw)) return raw;

  let d = raw.replace(/\D/g, "");
  if (!d) return raw;

  if (d.startsWith("00972")) d = d.slice(2);
  if (d.startsWith("972") && d.length >= 11 && d.length <= 12) d = "0" + d.slice(3);
  if (d.length === 9 && /^[2-9]/.test(d)) d = "0" + d;

  if (d.length === 10 && d.startsWith("0")) return d;
  return raw.startsWith("+") ? "+" + d : d;
}

/** True when the value is a real, canonical Israeli number (not a sentinel / foreign / garbage). */
export function isCanonicalIlPhone(phone: string | null | undefined): boolean {
  return !!phone && /^0\d{9}$/.test(phone);
}

/** Display form: 050-1234567. Falls back to the stored value. */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  if (/^0\d{9}$/.test(phone)) return `${phone.slice(0, 3)}-${phone.slice(3)}`;
  return phone;
}

/** Postgres unique_violation on leads.phone → the same candidate already has a card. */
export function isPhoneUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "23505" && /phone/i.test(err.message ?? "");
}

export const DUPLICATE_PHONE_MESSAGE =
  "מספר הטלפון הזה כבר קיים במערכת על כרטיס אחר. כל מועמד יכול להופיע פעם אחת בלבד — פתחו את הכרטיס הקיים או מזגו את הכרטיסים.";

/**
 * Search-box helper: if the query looks like a phone number (only digits,
 * spaces, dashes, +, parentheses — and at least 3 digits), return the bare
 * digits in the canonical DB form ("052-123 4567" / "+972 52 1234567" →
 * "0521234567"; partial "052-123" → "052123"). DB phones are stored without
 * separators, so this is what an ILIKE %…% must receive. Otherwise null.
 */
export function phoneSearchTerm(query: string | null | undefined): string | null {
  if (!query) return null;
  const raw = query.trim();
  if (!/^[\d\s\-+().]+$/.test(raw)) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length < 3) return null;
  if (d.startsWith("00972")) d = d.slice(2);
  if (d.startsWith("972") && d.length >= 11 && d.length <= 12) d = "0" + d.slice(3);
  return d;
}
