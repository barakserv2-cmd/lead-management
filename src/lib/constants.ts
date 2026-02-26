export const LEAD_STATUSES = {
  NEW: "חדש",
  FOLLOWUP: "מעקב",
  INTERVIEW: "ראיון במשרד",
  NOT_RELEVANT: "לא רלוונטי",
} as const;

export type LeadStatus = (typeof LEAD_STATUSES)[keyof typeof LEAD_STATUSES];

export const STATUS_COLORS: Record<LeadStatus, string> = {
  [LEAD_STATUSES.NEW]: "bg-blue-100 text-blue-800",
  [LEAD_STATUSES.FOLLOWUP]: "bg-orange-100 text-orange-800",
  [LEAD_STATUSES.INTERVIEW]: "bg-purple-100 text-purple-800",
  [LEAD_STATUSES.NOT_RELEVANT]: "bg-gray-200 text-gray-700",
};

// Sub-statuses keyed by main status — scalable for future statuses
export const SUB_STATUSES: Record<string, string[]> = {};

export const LEAD_SOURCES = [
  "AllJobs",
  "אימייל ישיר",
  "וואטסאפ",
  "טלפון",
  "אחר",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

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
  HOTEL: "hotel",
  RESTAURANT: "restaurant",
  CONSTRUCTION: "construction",
  OFFICE: "office",
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
