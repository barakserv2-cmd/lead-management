export const LEAD_STATUSES = {
  NEW: "חדש",
  PARSED: "מפוענח",
  CONTACTED: "נוצר קשר",
  ENGAGED: "מעורב",
  SCREENING: "בסינון",
  QUALIFIED: "מתאים",
  PLACED: "הושמה",
  HIRED: "התקבל",
  TERMINATED: "סיום העסקה",
  NO_RESPONSE: "ללא תגובה",
  FOLLOWUP_1: "Follow-up 1",
  FOLLOWUP_2: "Follow-up 2",
  COLD: "קר",
  REJECTED: "נדחה",
  REMOVED: "הוסר",
  ARCHIVED: "ארכיון",
} as const;

export type LeadStatus = (typeof LEAD_STATUSES)[keyof typeof LEAD_STATUSES];

export const STATUS_COLORS: Record<LeadStatus, string> = {
  [LEAD_STATUSES.NEW]: "bg-blue-100 text-blue-800",
  [LEAD_STATUSES.PARSED]: "bg-indigo-100 text-indigo-800",
  [LEAD_STATUSES.CONTACTED]: "bg-cyan-100 text-cyan-800",
  [LEAD_STATUSES.ENGAGED]: "bg-teal-100 text-teal-800",
  [LEAD_STATUSES.SCREENING]: "bg-yellow-100 text-yellow-800",
  [LEAD_STATUSES.QUALIFIED]: "bg-green-100 text-green-800",
  [LEAD_STATUSES.PLACED]: "bg-emerald-100 text-emerald-800",
  [LEAD_STATUSES.HIRED]: "bg-purple-100 text-purple-800",
  [LEAD_STATUSES.TERMINATED]: "bg-stone-200 text-stone-800",
  [LEAD_STATUSES.NO_RESPONSE]: "bg-gray-100 text-gray-800",
  [LEAD_STATUSES.FOLLOWUP_1]: "bg-orange-100 text-orange-800",
  [LEAD_STATUSES.FOLLOWUP_2]: "bg-amber-100 text-amber-800",
  [LEAD_STATUSES.COLD]: "bg-slate-100 text-slate-800",
  [LEAD_STATUSES.REJECTED]: "bg-red-100 text-red-800",
  [LEAD_STATUSES.REMOVED]: "bg-rose-100 text-rose-800",
  [LEAD_STATUSES.ARCHIVED]: "bg-zinc-100 text-zinc-800",
};

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
