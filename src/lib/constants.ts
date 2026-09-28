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

// ── Employment end reasons ("סיום העסקה") ──────────────────
// הקוד נשמר ב-leads.employment_end_reason. planned = סיום טבעי (השלים
// תקופה / התגייס) — לא נספר כעזיבה מוקדמת בדוח השימור.

export const EMPLOYMENT_END_REASONS = [
  { code: "completed_term", label: "השלים את התקופה", planned: true },
  { code: "army_draft", label: "התגייס לצבא", planned: true },
  { code: "burned_out", label: "מיצה / רצה לחזור הביתה", planned: false },
  { code: "eilat_not_for_me", label: "אילת לא התאימה לו", planned: false },
  { code: "better_offer", label: "מצא עבודה עם תנאים טובים יותר", planned: false },
  { code: "went_direct", label: "עבר לעבוד ישירות אצל המעסיק", planned: false },
  { code: "employer_ended", label: "המעסיק סיים את ההעסקה", planned: false },
  { code: "housing", label: "בעיה במגורים", planned: false },
  { code: "personal", label: "סיבה אישית / משפחתית", planned: false },
  { code: "never_started", label: "לא התחיל לעבוד בפועל", planned: false },
  { code: "other", label: "אחר", planned: false },
] as const;

export type EmploymentEndReason = (typeof EMPLOYMENT_END_REASONS)[number]["code"];

export function isEmploymentEndReason(v: unknown): v is EmploymentEndReason {
  return EMPLOYMENT_END_REASONS.some((r) => r.code === v);
}

export function employmentEndReasonLabel(code: string | null | undefined): string {
  if (!code) return "לא צוין";
  return EMPLOYMENT_END_REASONS.find((r) => r.code === code)?.label ?? code;
}

// ── Candidate segment ("סוג מועמד") ────────────────────────
// מי שבא עם מטרה ותאריך נשאר יותר — הפילוח הזה מאפשר לבדוק את זה בדוחות.

export const CANDIDATE_SEGMENTS = [
  { code: "boarding_pre_army", label: "בוגר פנימייה / לפני גיוס" },
  { code: "preferred_work", label: "חייל משוחרר — עבודה מועדפת" },
  { code: "post_army", label: "אחרי צבא" },
  { code: "oleh", label: "עולה חדש" },
  { code: "seasonal", label: "עובד עונתי" },
  { code: "older", label: "מבוגר" },
  { code: "other", label: "אחר" },
] as const;

export type CandidateSegment = (typeof CANDIDATE_SEGMENTS)[number]["code"];

export function isCandidateSegment(v: unknown): v is CandidateSegment {
  return CANDIDATE_SEGMENTS.some((s) => s.code === v);
}

export function candidateSegmentLabel(code: string | null | undefined): string {
  if (!code) return "לא סומן";
  return CANDIDATE_SEGMENTS.find((s) => s.code === code)?.label ?? code;
}

// ── No-arrival reasons ("לא הגיע" / "ביטל הגעה") ───────────

export const NO_ARRIVAL_REASONS = [
  { code: "personal", label: "קרה משהו אישי" },
  { code: "not_for_me", label: "החליט שזה לא מתאים לו" },
  { code: "friend_backed_out", label: "החבר שהיה אמור להגיע התחרט" },
  { code: "found_other_job", label: "מצא עבודה אחרת" },
  { code: "travel_or_money", label: "נסיעה / כסף" },
  { code: "housing", label: "מגורים" },
  { code: "unreachable", label: "לא עונה" },
  { code: "other", label: "אחר" },
] as const;

export type NoArrivalReason = (typeof NO_ARRIVAL_REASONS)[number]["code"];

export function isNoArrivalReason(v: unknown): v is NoArrivalReason {
  return NO_ARRIVAL_REASONS.some((r) => r.code === v);
}

export function noArrivalReasonLabel(code: string | null | undefined): string {
  if (!code) return "לא צוין";
  return NO_ARRIVAL_REASONS.find((r) => r.code === code)?.label ?? code;
}

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
