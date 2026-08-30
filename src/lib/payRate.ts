// pay_rate הוא טקסט חופשי שהרכזות מקלידות, ולכן מיון "לפי שכר" חייב לפענח
// אותו. הפורמטים שקיימים בפועל במסד (222 משרות):
//   "40" · "45" · "37.4"   — תעריף לשעה
//   "40₪"                  — עם סימן מטבע
//   "40+2" · "35.4+3"      — תעריף + תוספת קבועה → מסכמים
//   "37-40" · "45-50"      — טווח → הקצה העליון, זה מה שמשווים אליו
//   "40+"                  — "40 ומעלה" → 40
//   "מעמד הראיון"          — לא מספרי כלל → null, לא 0

export interface ParsedPay {
  /** הערך להשוואה ומיון, בש"ח לשעה. null = לא ניתן לפענוח. */
  value: number | null;
  /** true כשהמקור הוא טווח או "ומעלה" — הערך הוא הקצה העליון. */
  approximate: boolean;
}

export function parsePayRate(raw: string | null | undefined): ParsedPay {
  const text = (raw ?? "").trim();
  if (!text) return { value: null, approximate: false };

  // מנקים מטבע ורווחים, משאירים ספרות, נקודה עשרונית, + ו-
  const cleaned = text.replace(/[₪\s,]/g, "");
  const numbers = cleaned.match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return { value: null, approximate: false };

  const nums = numbers.map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { value: null, approximate: false };

  // תוספת: "40+2" → 42. חייב + בין שני מספרים, אחרת זה "40+" (ומעלה).
  if (/\d\+\d/.test(cleaned) && nums.length >= 2) {
    return { value: nums[0] + nums[1], approximate: false };
  }

  // טווח: "37-40" → 40. משווים לפי מה שאפשר להרוויח בפועל.
  if (/\d-\d/.test(cleaned) && nums.length >= 2) {
    return { value: Math.max(...nums), approximate: true };
  }

  // "40+" — ומעלה
  if (/\d\+$/.test(cleaned)) return { value: nums[0], approximate: true };

  return { value: nums[0], approximate: false };
}

/** תווית קצרה לתצוגה ליד הטקסט המקורי. */
export function payLabel(raw: string | null | undefined): string | null {
  const { value, approximate } = parsePayRate(raw);
  if (value === null) return null;
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return approximate ? `עד ₪${n}` : `₪${n}`;
}
