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

/**
 * גורם הגיוס שהמכונה (גובגט) כותבת על כל ליד שהיא יוצרת, דרך
 * /api/bridge/from-machine. מיוצא כקבוע כדי שלא יהיה מחרוזת חופשית בשני צדדים.
 */
export const GUBGET_SOURCE = "גובגט";

/**
 * גורמי גיוס שנכתבים על ידי קוד ולא נבחרים ביד — הגשר של המכונה, ייבוא
 * אקסל, והוובהוק של וואטסאפ. הם במכוון לא נמצאים ב-LEAD_SOURCES, כי הרשימה
 * הזאת היא בורר הידני של הרכזות ואסור שיופיעו בה ערכים שאיש לא בוחר.
 * דוחות וסינונים צריכים לאחד את שתי הרשימות דרך ALL_LEAD_SOURCES.
 */
export const MACHINE_LEAD_SOURCES = [
  GUBGET_SOURCE,
  "ייבוא Excel",
  "אקסטרות",
  "וואטסאפ ישיר",
  // ישן: נכתב על ידי זרימת סינון קודמת שכבר לא רצה, אבל יש לידים עם הערך.
  "whatsapp_screening",
] as const;

/** כל גורם גיוס ידוע — ידני + נכתב-מכונה. לסינון ולדוחות, לא לבורר. */
export const ALL_LEAD_SOURCES = [...LEAD_SOURCES, ...MACHINE_LEAD_SOURCES] as const;

export type ManualLeadSource = (typeof LEAD_SOURCES)[number];
export type MachineLeadSource = (typeof MACHINE_LEAD_SOURCES)[number];

/**
 * עמודת source היא טקסט חופשי בפועל: מלבד הרשימות שלמעלה יש בה גם תיוג
 * ברמת הקמפיין ("פייסבוק - BARAK TLV CASHIERS"), שנוצר לפי כלל ב-gmail.ts.
 * לכן הטיפוס פתוח: התוספת של string שומרת על ההשלמה האוטומטית של
 * הערכים הידועים, בלי לשקר שהם הערכים היחידים.
 */
export type LeadSource = ManualLeadSource | MachineLeadSource | (string & {});

// Sub-statuses keyed by main status — scalable for future statuses
// Triggering "אין מענה 3" auto-transitions the lead to LOST_CONTACT
// (handled in status-select.tsx).
export const NO_ANSWER_3 = "אין מענה 3";

// מועמד שרוצה לעבוד אבל לא עכשיו — מעביר אותו לתזכורת חזרה במקום לסגור אותו
export const NOT_AVAILABLE_NOW = "לא זמין במיידי";

// "מעקב" = החלטה שנדחתה. בלי מועד היא לא משימה אלא כוונה, ולכן בחירתו
// מחייבת תזכורת עם תאריך — אחרת המועמד יושב שם עד שמישהו נזכר במקרה.
export const FOLLOW_UP = "מעקב";

// המועמד הגיע למשרד ונשלח להתראיין אצל המעסיק — דורש משרה ושעה
export const SENT_TO_INTERVIEW = "נשלח לראיון";

export const SUB_STATUSES: Record<string, string[]> = {
  CONTACTED: ["אין מענה 1", "אין מענה 2", NO_ANSWER_3, "מעקב"],
  // תמי, דיווח 09-09: "בראיונות להוסיף: אין מענה". ניסיון חיוג שלא נענה לא
  // סוגר את הראיון — הוא נשאר פתוח בלוח, רק מסומן שניסינו.
  INTERVIEW_BOOKED: ["אין מענה 1", "אין מענה 2", "אושר טלפונית", "מעקב"],
  ARRIVED: [SENT_TO_INTERVIEW],
  NOT_SUITABLE: [
    "הסיר מועמדות",
    "לא תואם דרישות",
    "לא תואם גאוגרפית",
    "לא תואם שכר",
    NOT_AVAILABLE_NOW,
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

// ── Rejection reasons for "נדחה" ──────────────────────────
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
