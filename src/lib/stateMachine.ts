// ============================================================
// State Machine: Strict Lead Status Transitions
// Every status change MUST go through this module.
// ============================================================

// ── Status Enum ─────────────────────────────────────────────

export const LeadStatus = {
  NEW_LEAD: "NEW_LEAD",
  CONTACTED: "CONTACTED",
  SCREENING_IN_PROGRESS: "SCREENING_IN_PROGRESS",
  FIT_FOR_INTERVIEW: "FIT_FOR_INTERVIEW",
  INTERVIEW_BOOKED: "INTERVIEW_BOOKED",
  ARRIVED: "ARRIVED",
  HIRED: "HIRED",
  STARTED: "STARTED",
  NO_SHOW: "NO_SHOW",
  REJECTED: "REJECTED",
  LOST_CONTACT: "LOST_CONTACT",
} as const;

export type LeadStatusValue = (typeof LeadStatus)[keyof typeof LeadStatus];

export const ALL_STATUSES = Object.values(LeadStatus) as LeadStatusValue[];

// ── Hebrew Labels ───────────────────────────────────────────

export const STATUS_LABELS: Record<LeadStatusValue, string> = {
  [LeadStatus.NEW_LEAD]: "ליד חדש",
  [LeadStatus.CONTACTED]: "נוצר קשר",
  [LeadStatus.SCREENING_IN_PROGRESS]: "בסינון",
  [LeadStatus.FIT_FOR_INTERVIEW]: "מתאים לראיון",
  [LeadStatus.INTERVIEW_BOOKED]: "ראיון נקבע",
  [LeadStatus.ARRIVED]: "הגיע לראיון",
  [LeadStatus.HIRED]: "התקבל",
  [LeadStatus.STARTED]: "התחיל לעבוד",
  [LeadStatus.NO_SHOW]: "לא הגיע",
  [LeadStatus.REJECTED]: "נדחה",
  [LeadStatus.LOST_CONTACT]: "אבד קשר",
};

// ── Status Colors ───────────────────────────────────────────

export const STATUS_COLORS: Record<LeadStatusValue, { bg: string; text: string; dot: string }> = {
  [LeadStatus.NEW_LEAD]:              { bg: "bg-blue-100",   text: "text-blue-800",   dot: "bg-blue-500" },
  [LeadStatus.CONTACTED]:             { bg: "bg-cyan-100",   text: "text-cyan-800",   dot: "bg-cyan-500" },
  [LeadStatus.SCREENING_IN_PROGRESS]: { bg: "bg-orange-100", text: "text-orange-800", dot: "bg-orange-500" },
  [LeadStatus.FIT_FOR_INTERVIEW]:     { bg: "bg-amber-100",  text: "text-amber-800",  dot: "bg-amber-500" },
  [LeadStatus.INTERVIEW_BOOKED]:      { bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-500" },
  [LeadStatus.ARRIVED]:               { bg: "bg-indigo-100", text: "text-indigo-800", dot: "bg-indigo-500" },
  [LeadStatus.HIRED]:                 { bg: "bg-green-100",  text: "text-green-800",  dot: "bg-green-500" },
  [LeadStatus.STARTED]:               { bg: "bg-emerald-100",text: "text-emerald-800",dot: "bg-emerald-500" },
  [LeadStatus.NO_SHOW]:               { bg: "bg-red-100",    text: "text-red-800",    dot: "bg-red-500" },
  [LeadStatus.REJECTED]:              { bg: "bg-gray-200",   text: "text-gray-700",   dot: "bg-gray-500" },
  [LeadStatus.LOST_CONTACT]:          { bg: "bg-rose-100",   text: "text-rose-800",   dot: "bg-rose-500" },
};

// ── Transition Rules ────────────────────────────────────────
// Each key lists the statuses it is ALLOWED to move to.

const TRANSITION_MAP: Record<LeadStatusValue, LeadStatusValue[]> = {
  [LeadStatus.NEW_LEAD]: [
    LeadStatus.CONTACTED,
    LeadStatus.REJECTED,
    LeadStatus.LOST_CONTACT,
  ],
  [LeadStatus.CONTACTED]: [
    LeadStatus.SCREENING_IN_PROGRESS,
    LeadStatus.REJECTED,
    LeadStatus.LOST_CONTACT,
  ],
  [LeadStatus.SCREENING_IN_PROGRESS]: [
    LeadStatus.FIT_FOR_INTERVIEW,
    LeadStatus.REJECTED,
    LeadStatus.LOST_CONTACT,
  ],
  [LeadStatus.FIT_FOR_INTERVIEW]: [
    LeadStatus.INTERVIEW_BOOKED,
    LeadStatus.REJECTED,
    LeadStatus.LOST_CONTACT,
  ],
  [LeadStatus.INTERVIEW_BOOKED]: [
    LeadStatus.ARRIVED,
    LeadStatus.NO_SHOW,
    LeadStatus.REJECTED,
    LeadStatus.LOST_CONTACT,
  ],
  [LeadStatus.ARRIVED]: [
    LeadStatus.HIRED,
    LeadStatus.REJECTED,
  ],
  [LeadStatus.HIRED]: [
    LeadStatus.STARTED,
    LeadStatus.REJECTED,
  ],
  [LeadStatus.STARTED]: [
    LeadStatus.REJECTED,
  ],
  [LeadStatus.NO_SHOW]: [
    LeadStatus.INTERVIEW_BOOKED,
    LeadStatus.REJECTED,
    LeadStatus.LOST_CONTACT,
  ],
  [LeadStatus.REJECTED]: [
    LeadStatus.NEW_LEAD,
  ],
  [LeadStatus.LOST_CONTACT]: [
    LeadStatus.CONTACTED,
    LeadStatus.REJECTED,
  ],
};

// ── Guardrail Conditions ────────────────────────────────────
// Extra data conditions required for specific transitions.

export interface LeadGuardrailData {
  screening_score?: number | null;
  human_approval?: boolean | null;
  interview_date?: string | null;
}

type GuardrailFn = (data: LeadGuardrailData) => string | null; // returns error message or null

const GUARDRAILS: Partial<Record<LeadStatusValue, GuardrailFn>> = {
  [LeadStatus.FIT_FOR_INTERVIEW]: (data) => {
    if (data.screening_score == null || data.screening_score <= 0) {
      return "לא ניתן להעביר למתאים לראיון ללא ציון סינון (screening_score)";
    }
    return null;
  },
  [LeadStatus.INTERVIEW_BOOKED]: (data) => {
    if (!data.interview_date) {
      return "לא ניתן לקבוע ראיון ללא תאריך ראיון (interview_date)";
    }
    return null;
  },
  [LeadStatus.HIRED]: (data) => {
    if (!data.human_approval) {
      return "לא ניתן להעביר להתקבל ללא אישור מנהל (human_approval)";
    }
    return null;
  },
};

// ── Public API ───────────────────────────────────────────────

export function isValidStatus(status: string): status is LeadStatusValue {
  return ALL_STATUSES.includes(status as LeadStatusValue);
}

export function getAllowedTransitions(currentStatus: LeadStatusValue): LeadStatusValue[] {
  return TRANSITION_MAP[currentStatus] ?? [];
}

export interface TransitionValidation {
  valid: boolean;
  error?: string;
}

export function validateTransition(
  fromStatus: LeadStatusValue,
  toStatus: LeadStatusValue,
  guardrailData?: LeadGuardrailData
): TransitionValidation {
  // 1. Check if target status is valid
  if (!isValidStatus(toStatus)) {
    return { valid: false, error: `סטטוס לא חוקי: ${toStatus}` };
  }

  // 2. Check if transition is allowed
  const allowed = TRANSITION_MAP[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    return {
      valid: false,
      error: `מעבר לא חוקי: ${STATUS_LABELS[fromStatus]} → ${STATUS_LABELS[toStatus]}`,
    };
  }

  // 3. Check guardrails
  const guardrailFn = GUARDRAILS[toStatus];
  if (guardrailFn) {
    const guardrailError = guardrailFn(guardrailData ?? {});
    if (guardrailError) {
      return { valid: false, error: guardrailError };
    }
  }

  return { valid: true };
}
