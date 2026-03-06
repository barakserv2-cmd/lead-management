// Re-export the state machine as the single source of truth for statuses
export {
  LeadStatus as LEAD_STATUSES,
  type LeadStatusValue as LeadStatus,
  STATUS_LABELS,
  STATUS_COLORS,
  ALL_STATUSES,
} from "./stateMachine";

export const LEAD_SOURCES = [
  "AllJobs",
  "אימייל ישיר",
  "וואטסאפ",
  "טלפון",
  "אחר",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

// Sub-statuses keyed by main status — scalable for future statuses
export const SUB_STATUSES: Record<string, string[]> = {};

// --- CRM enums ---

export const FINANCIAL_STATUSES = {
  BALANCED: "balanced",
  DELAYED_PAYMENT: "delayed_payment",
  DEBT: "debt",
  BAD_DEBT: "bad_debt",
} as const;

export type FinancialStatus =
  (typeof FINANCIAL_STATUSES)[keyof typeof FINANCIAL_STATUSES];

export const CLIENT_TYPES = {
  HOTELS: "hotels",
  FASHION: "fashion",
  RETAIL: "retail",
  PHARMA: "pharma",
  OTHER: "other",
} as const;

export type ClientType = (typeof CLIENT_TYPES)[keyof typeof CLIENT_TYPES];

export const RECRUITMENT_STATUSES = {
  ACTIVE: "active",
  FROZEN: "frozen",
  ON_HOLD: "on_hold",
} as const;

export type RecruitmentStatus =
  (typeof RECRUITMENT_STATUSES)[keyof typeof RECRUITMENT_STATUSES];

// ── Rejection reasons for "נדחה" ──────────────────────────
export const REJECTION_REASONS = [
  "אין מענה 3",
  "לא מתאים",
  "דחוי",
  "שכר לא תואם את הדרישה",
  "חסום",
] as const;

// ── Conversation Mode enums ─────────────────────────────────

export const INTERACTION_TYPES = {
  call_in: "שיחה נכנסת",
  call_out: "שיחה יוצאת",
  whatsapp: "וואטסאפ",
} as const;

export const INTERACTION_OUTCOMES = {
  request: "בקשה",
  complaint: "תלונה",
  update: "עדכון",
  other: "אחר",
} as const;

export const REMINDER_PRIORITIES = {
  high: "דחוף",
  normal: "רגיל",
} as const;
