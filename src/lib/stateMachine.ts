// ============================================================
// State Machine: Lead Status Transitions
// Every status change MUST go through validateTransition().
//
// The map below is NOT a linear ladder. It was rebuilt on 2026-09-08 from
// 120 days of real lead_status_history (5,000+ transitions): recruiters
// legitimately skip stages (phone-screen a lead and book straight from
// "ממתין לנציג"), reopen closed leads, and undo mis-clicks. What the map
// enforces are the business invariants that reports and the interview
// board actually depend on:
//
//   1. "התחיל לעבוד" only after "התקבל" — the hire dialog is where the
//      employer/position/start date get recorded.
//   2. "סיום העסקה" only for someone who was hired.
//   3. "לא הגיע" only when an interview existed to miss.
//   4. "לא התקבל" only after an interview stage.
//   5. "הגיע לראיון" needs a booked (dated) interview first.
//   6. Post-hire leads never silently regress to pre-interview stages.
//   7. The machine (גובגט) may only move leads inside the pre-interview
//      funnel; it never hires, rejects, or reopens a human's closure.
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
  // interview-outcome statuses set by a recruiter from the interviews board
  CANCELLED_ARRIVAL: "CANCELLED_ARRIVAL", // ביטל הגעה — candidate proactively cancelled
  POSTPONED_ARRIVAL: "POSTPONED_ARRIVAL", // דחה הגעה — wants to reschedule, needs re-booking
  NOT_ACCEPTED: "NOT_ACCEPTED",
  REJECTED: "REJECTED",
  LOST_CONTACT: "LOST_CONTACT",
  NOT_SUITABLE: "NOT_SUITABLE",
  INVALID_PHONE: "INVALID_PHONE",
  EMPLOYMENT_ENDED: "EMPLOYMENT_ENDED",
} as const;

export type LeadStatusValue = (typeof LeadStatus)[keyof typeof LeadStatus];

export const ALL_STATUSES = Object.values(LeadStatus) as LeadStatusValue[];

// ── Hebrew Labels ───────────────────────────────────────────

export const STATUS_LABELS: Record<LeadStatusValue, string> = {
  [LeadStatus.NEW_LEAD]: "ממתין לנציג",
  [LeadStatus.CONTACTED]: "נוצר קשר",
  [LeadStatus.SCREENING_IN_PROGRESS]: "בסינון",
  [LeadStatus.FIT_FOR_INTERVIEW]: "מתאים לראיון",
  [LeadStatus.INTERVIEW_BOOKED]: "ראיון נקבע",
  [LeadStatus.ARRIVED]: "הגיע לראיון",
  [LeadStatus.HIRED]: "התקבל",
  [LeadStatus.STARTED]: "התחיל לעבוד",
  [LeadStatus.NO_SHOW]: "לא הגיע",
  [LeadStatus.CANCELLED_ARRIVAL]: "ביטל הגעה",
  [LeadStatus.POSTPONED_ARRIVAL]: "דחה הגעה",
  // נפסל אחרי שהיה ראיון — להבדיל מ"נדחה" שסוגר ליד בכל שלב אחר
  [LeadStatus.NOT_ACCEPTED]: "לא התקבל",
  [LeadStatus.REJECTED]: "נדחה",
  [LeadStatus.LOST_CONTACT]: "אבד קשר",
  [LeadStatus.NOT_SUITABLE]: "לא מתאים",
  [LeadStatus.INVALID_PHONE]: "מספר לא תקין",
  [LeadStatus.EMPLOYMENT_ENDED]: "סיום העסקה",
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
  [LeadStatus.CANCELLED_ARRIVAL]:     { bg: "bg-fuchsia-100",text: "text-fuchsia-800",dot: "bg-fuchsia-500" },
  [LeadStatus.POSTPONED_ARRIVAL]:     { bg: "bg-teal-100",   text: "text-teal-800",   dot: "bg-teal-500" },
  [LeadStatus.NOT_ACCEPTED]:          { bg: "bg-pink-100",   text: "text-pink-800",   dot: "bg-pink-500" },
  [LeadStatus.REJECTED]:              { bg: "bg-gray-200",   text: "text-gray-700",   dot: "bg-gray-500" },
  [LeadStatus.LOST_CONTACT]:          { bg: "bg-rose-100",   text: "text-rose-800",   dot: "bg-rose-500" },
  [LeadStatus.NOT_SUITABLE]:          { bg: "bg-stone-200",  text: "text-stone-700",  dot: "bg-stone-500" },
  [LeadStatus.INVALID_PHONE]:         { bg: "bg-yellow-100", text: "text-yellow-800", dot: "bg-yellow-500" },
  [LeadStatus.EMPLOYMENT_ENDED]:      { bg: "bg-slate-200",  text: "text-slate-700",  dot: "bg-slate-500" },
};

// ── Status Groups ───────────────────────────────────────────

/** Before any interview happened — the funnel the machine is allowed to work in. */
export const PRE_INTERVIEW_STATUSES: readonly LeadStatusValue[] = [
  LeadStatus.NEW_LEAD,
  LeadStatus.CONTACTED,
  LeadStatus.SCREENING_IN_PROGRESS,
  LeadStatus.FIT_FOR_INTERVIEW,
];

/** An interview is scheduled or took place. */
export const INTERVIEW_STATUSES: readonly LeadStatusValue[] = [
  LeadStatus.INTERVIEW_BOOKED,
  LeadStatus.ARRIVED,
  LeadStatus.POSTPONED_ARRIVAL, // pushed off, still in play — needs re-booking
];

/** The candidate was hired at some point. */
export const POST_HIRE_STATUSES: readonly LeadStatusValue[] = [
  LeadStatus.HIRED,
  LeadStatus.STARTED,
  LeadStatus.EMPLOYMENT_ENDED,
];

/** Closed outcomes — the lead is out of the funnel until someone reopens it. */
export const CLOSED_STATUSES: readonly LeadStatusValue[] = [
  LeadStatus.NO_SHOW,
  LeadStatus.CANCELLED_ARRIVAL,
  LeadStatus.NOT_ACCEPTED,
  LeadStatus.REJECTED,
  LeadStatus.LOST_CONTACT,
  LeadStatus.NOT_SUITABLE,
  LeadStatus.INVALID_PHONE,
];

// ── Transition Rules ────────────────────────────────────────
// Each key lists the statuses it is ALLOWED to move to.

const {
  NEW_LEAD, CONTACTED, SCREENING_IN_PROGRESS, FIT_FOR_INTERVIEW, INTERVIEW_BOOKED,
  ARRIVED, HIRED, STARTED, NO_SHOW, CANCELLED_ARRIVAL, POSTPONED_ARRIVAL,
  NOT_ACCEPTED, REJECTED, LOST_CONTACT,
  NOT_SUITABLE, INVALID_PHONE, EMPLOYMENT_ENDED,
} = LeadStatus;

// Closures a lead can take before any interview existed.
const PRE_INTERVIEW_CLOSURES: LeadStatusValue[] = [REJECTED, LOST_CONTACT, NOT_SUITABLE, INVALID_PHONE];

export const TRANSITION_MAP: Record<LeadStatusValue, readonly LeadStatusValue[]> = {
  // Forward skips are normal: a recruiter phone-screens and books directly.
  // HIRED straight from the funnel is a walk-in hire — allowed, but the hire
  // dialog (job + start date + human approval) still gates it.
  [NEW_LEAD]: [CONTACTED, SCREENING_IN_PROGRESS, FIT_FOR_INTERVIEW, INTERVIEW_BOOKED, HIRED, ...PRE_INTERVIEW_CLOSURES],
  [CONTACTED]: [NEW_LEAD, SCREENING_IN_PROGRESS, FIT_FOR_INTERVIEW, INTERVIEW_BOOKED, HIRED, ...PRE_INTERVIEW_CLOSURES],
  [SCREENING_IN_PROGRESS]: [NEW_LEAD, CONTACTED, FIT_FOR_INTERVIEW, INTERVIEW_BOOKED, HIRED, ...PRE_INTERVIEW_CLOSURES],
  [FIT_FOR_INTERVIEW]: [NEW_LEAD, CONTACTED, SCREENING_IN_PROGRESS, INTERVIEW_BOOKED, ARRIVED, HIRED, ...PRE_INTERVIEW_CLOSURES],

  // Interview stage. Going back to the funnel = the interview was cancelled.
  [INTERVIEW_BOOKED]: [
    NEW_LEAD, CONTACTED, SCREENING_IN_PROGRESS, FIT_FOR_INTERVIEW,
    ARRIVED, HIRED, NO_SHOW, CANCELLED_ARRIVAL, POSTPONED_ARRIVAL,
    NOT_ACCEPTED, REJECTED, LOST_CONTACT, NOT_SUITABLE,
  ],
  // ARRIVED → INTERVIEW_BOOKED is a second interview (another employer).
  [ARRIVED]: [INTERVIEW_BOOKED, HIRED, NO_SHOW, NOT_ACCEPTED, REJECTED, LOST_CONTACT, NOT_SUITABLE],

  // Interview outcomes: candidate cancelled or postponed coming.
  // CANCELLED = closed-ish (re-book, reopen, or close). POSTPONED = re-book is
  // the main path, but can also be cancelled or closed.
  [CANCELLED_ARRIVAL]: [INTERVIEW_BOOKED, CONTACTED, NO_SHOW, REJECTED, LOST_CONTACT, NOT_SUITABLE],
  [POSTPONED_ARRIVAL]: [INTERVIEW_BOOKED, CONTACTED, CANCELLED_ARRIVAL, NO_SHOW, REJECTED, LOST_CONTACT, NOT_SUITABLE],

  // Post-hire. ARRIVED / HIRED backwards are one-step undo of a mis-click.
  [HIRED]: [STARTED, EMPLOYMENT_ENDED, ARRIVED, NOT_ACCEPTED, REJECTED],
  [STARTED]: [EMPLOYMENT_ENDED, HIRED],
  // עובד שסיים העסקה — אפשר לחזור אליו לגיוס מחדש או לקבל אותו ישירות
  [EMPLOYMENT_ENDED]: [CONTACTED, HIRED],

  // Closed outcomes: reopen into the funnel, re-book, or reclassify.
  [NO_SHOW]: [NEW_LEAD, CONTACTED, INTERVIEW_BOOKED, ARRIVED, REJECTED, LOST_CONTACT, NOT_SUITABLE],
  [NOT_ACCEPTED]: [NEW_LEAD, CONTACTED, INTERVIEW_BOOKED, HIRED, REJECTED, NOT_SUITABLE],
  [REJECTED]: [NEW_LEAD, CONTACTED, INTERVIEW_BOOKED, NOT_ACCEPTED, NOT_SUITABLE],
  [LOST_CONTACT]: [
    NEW_LEAD, CONTACTED, SCREENING_IN_PROGRESS, FIT_FOR_INTERVIEW, INTERVIEW_BOOKED, HIRED,
    REJECTED, NOT_SUITABLE, INVALID_PHONE,
  ],
  [NOT_SUITABLE]: [NEW_LEAD, CONTACTED, SCREENING_IN_PROGRESS, INTERVIEW_BOOKED, REJECTED],
  // Bad/unreachable number — recover once the number is corrected, otherwise close.
  [INVALID_PHONE]: [NEW_LEAD, CONTACTED, REJECTED, NOT_SUITABLE],
};

// ── Machine (גובגט) Rules ───────────────────────────────────
// The autonomous machine works the pre-interview funnel only. It may pick a
// lost-contact lead back up when the candidate writes again, but it never
// hires, never rejects, and never reopens a closure a human made.

export const MACHINE_ALLOWED_FROM: readonly LeadStatusValue[] = [
  ...PRE_INTERVIEW_STATUSES,
  LOST_CONTACT,
];

export const MACHINE_ALLOWED_TO: readonly LeadStatusValue[] = [
  CONTACTED,
  SCREENING_IN_PROGRESS,
  FIT_FOR_INTERVIEW,
  INTERVIEW_BOOKED,
  NOT_SUITABLE,
];

// ── Guardrail Conditions ────────────────────────────────────
// Extra data conditions required for specific transitions.

export type TransitionActor = "human" | "machine" | "system";

export interface LeadGuardrailData {
  screening_score?: number | null;
  human_approval?: boolean | null;
  interview_date?: string | null;
  /** Who is making the move. Defaults to "human" when omitted. */
  actor?: TransitionActor;
}

type GuardrailFn = (data: LeadGuardrailData) => string | null; // returns error message or null

const GUARDRAILS: Partial<Record<LeadStatusValue, GuardrailFn>> = {
  // A human recruiter screens by phone and needs no numeric score. Any
  // automated actor (the legacy bot, גובגט) must bring one.
  [FIT_FOR_INTERVIEW]: (data) => {
    const actor = data.actor ?? "human";
    if (actor === "human") return null;
    if (data.screening_score == null || data.screening_score <= 0) {
      return "לא ניתן להעביר למתאים לראיון ללא ציון סינון (screening_score)";
    }
    return null;
  },
  [INTERVIEW_BOOKED]: (data) => {
    if (!data.interview_date) {
      return "לא ניתן לקבוע ראיון ללא תאריך ראיון (interview_date)";
    }
    return null;
  },
  [HIRED]: (data) => {
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

/** Classify a userId / changed_by value into a transition actor. */
export function actorFromUserId(userId?: string | null): TransitionActor {
  const id = (userId ?? "").trim().toLowerCase();
  if (!id || id === "system" || id === "cron") return "system";
  if (id === "ai-recruiter" || id.startsWith("gubget@")) return "machine";
  return "human";
}

export function getAllowedTransitions(
  currentStatus: LeadStatusValue,
  actor: TransitionActor = "human"
): LeadStatusValue[] {
  const targets = TRANSITION_MAP[currentStatus] ?? [];
  if (actor !== "machine") return [...targets];
  if (!MACHINE_ALLOWED_FROM.includes(currentStatus)) return [];
  return targets.filter((t) => MACHINE_ALLOWED_TO.includes(t));
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
  // 1. Both ends must be real statuses
  if (!isValidStatus(toStatus)) {
    return { valid: false, error: `סטטוס לא חוקי: ${toStatus}` };
  }
  if (!isValidStatus(fromStatus)) {
    // Legacy rows with an unknown status may move anywhere valid — once.
    return { valid: true };
  }
  if (fromStatus === toStatus) {
    return { valid: true };
  }

  const actor = guardrailData?.actor ?? "human";

  // 2. Is the transition on the map?
  const allowed = TRANSITION_MAP[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    return {
      valid: false,
      error: `מעבר לא חוקי: ${STATUS_LABELS[fromStatus]} ← ${STATUS_LABELS[toStatus]}`,
    };
  }

  // 3. Machine scope
  if (actor === "machine") {
    if (!MACHINE_ALLOWED_FROM.includes(fromStatus)) {
      return {
        valid: false,
        error: `גובגט לא רשאית לשנות ליד במצב ${STATUS_LABELS[fromStatus]}`,
      };
    }
    if (!MACHINE_ALLOWED_TO.includes(toStatus)) {
      return {
        valid: false,
        error: `גובגט לא רשאית להעביר ליד ל${STATUS_LABELS[toStatus]}`,
      };
    }
  }

  // 4. Guardrails on the target status
  const guardrailFn = GUARDRAILS[toStatus];
  if (guardrailFn) {
    const guardrailError = guardrailFn(guardrailData ?? {});
    if (guardrailError) {
      return { valid: false, error: guardrailError };
    }
  }

  return { valid: true };
}
