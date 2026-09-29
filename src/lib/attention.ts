// ============================================================
// דגל "דורש תשומת לב" — סוגים וניקוי
// ============================================================
//
// needs_attention נדלק מהרבה מקומות, ואף אחד לא כיבה את מה שכבר לא רלוונטי.
// ב-29/09 היו 66 מתוך 83 העובדים הפעילים מסומנים — 30 מהם התראות "תקופת
// האחריות נגמרת" שהאחריות שלהן כבר עברה. כשכמעט כולם מסומנים, הדגל לא אומר
// כלום, והתראה דחופה של מלווה ההגעה נבלעת בין ישנות.
//
// הסוג נגזר מתחילית attention_reason (בלי עמודה נוספת):
//   urgent    — "🚩 ..." (מלווה ההגעה): לטפל היום, מוצג ראשון ובאדום.
//   guarantee — "⏳ תקופת האחריות ...": תזכורת; מתנקה לבד כשהאחריות עוברת.
//   normal    — כל השאר.

import { LeadStatus } from "./stateMachine";

export type AttentionKind = "urgent" | "guarantee" | "normal";

/**
 * סטטוסים סגורים. מעבר לאחד מהם מכבה את הדגל — הרכזת כבר טיפלה והחליטה.
 * דגל שנדלק *אחרי* הסגירה (למשל "פנייה חוזרת" של מועמד שנסגר והגיש שוב)
 * נשאר: זה אות חדש, לא שארית.
 */
export const CLOSED_STATUSES: string[] = [
  LeadStatus.REJECTED,
  LeadStatus.NOT_SUITABLE,
  LeadStatus.LOST_CONTACT,
  LeadStatus.INVALID_PHONE,
  LeadStatus.NOT_ACCEPTED,
  LeadStatus.NO_SHOW,
  LeadStatus.CANCELLED_ARRIVAL,
  LeadStatus.EMPLOYMENT_ENDED,
];

export function isClosedStatus(status: string | null | undefined): boolean {
  return !!status && CLOSED_STATUSES.includes(status);
}

export const URGENT_PREFIX = "🚩";
export const GUARANTEE_PREFIX = "⏳ תקופת האחריות";

/** התראת האחריות נדלקת 6–7 ימים לפני הסוף — אחרי 8 ימים האחריות כבר עברה. */
export const GUARANTEE_FLAG_TTL_DAYS = 8;

export function attentionKind(reason: string | null | undefined): AttentionKind {
  const r = (reason ?? "").trim();
  if (r.startsWith(URGENT_PREFIX)) return "urgent";
  if (r.startsWith(GUARANTEE_PREFIX)) return "guarantee";
  return "normal";
}

/** דגל אחריות שהאחריות שלו כבר עברה — אפשר לכבות בלי שרכזת תראה אותו. */
export function isExpiredGuaranteeFlag(
  reason: string | null | undefined,
  flaggedAt: string | null | undefined,
  now: Date
): boolean {
  if (attentionKind(reason) !== "guarantee" || !flaggedAt) return false;
  return now.getTime() - new Date(flaggedAt).getTime() >= GUARANTEE_FLAG_TTL_DAYS * 86_400_000;
}
