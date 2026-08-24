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
  "פייסבוק",
  "אתר - טופס משרה",
  "אתר - עמוד ראשי",
  "אתר - טופס תחתון",
  "אתר - צור קשר",
  "צ'אט באתר",
  "דף נחיתה",
  "גוגל ממומן",
  "אינסטגרם",
  "טיקטוק",
  'פק"ש',
  "אימייל ישיר",
  "וואטסאפ",
  "טלפון",
  "אחר",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

// Sub-statuses keyed by main status — scalable for future statuses
// Triggering "אין מענה 3" auto-transitions the lead to LOST_CONTACT
// (handled in status-select.tsx).
export const NO_ANSWER_3 = "אין מענה 3";

export const SUB_STATUSES: Record<string, string[]> = {
  CONTACTED: ["אין מענה 1", "אין מענה 2", NO_ANSWER_3, "מעקב"],
  NOT_SUITABLE: [
    "הסיר מועמדות",
    "לא תואם דרישות",
    "לא תואם גאוגרפית",
    "לא תואם שכר",
    "לא זמין במיידי",
  ],
};

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

// ── Rejection reasons for "לא התקבל" ──────────────────────
export const REJECTION_REASONS = [
  "אין מענה 3",
  "לא מתאים",
  "דחוי",
  "שכר לא תואם את הדרישה",
  "חסום",
] as const;

// סיבות מהירות לסטטוס "לא התקבל" בלוח הראיונות — קליק אחד במקום
// להקליד, אבל התיעוד החופשי עדיין חובה.
export const INTERVIEW_REJECTION_REASONS = [
  "לא מתאים לתפקיד",
  "חוסר ניסיון",
  "המעסיק לא אישר",
  "בעיית זמינות / משמרות",
  "ציפיות שכר",
  "בעיית שפה / תקשורת",
  "מראה / הופעה",
  "המועמד ויתר",
  "אחר",
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
