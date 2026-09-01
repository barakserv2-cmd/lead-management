import type {
  LeadStatus,
  LeadSource,
  FinancialStatus,
  ClientType,
  RecruitmentStatus,
} from "@/lib/constants";

export interface Lead {
  id: string;
  created_at: string;
  /** auto-set by DB trigger on every row modification */
  updated_at: string;
  /** set when personal data was stripped (retention job / erasure request) */
  anonymized_at?: string | null;
  /** opt-out: המועמד/ת ביקש/ה לא לקבל הודעות — שער השליחה חוסם הכל */
  do_not_contact?: boolean;
  name: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  location: string | null;
  experience: string | null;
  age: number | null;
  job_title: string | null;
  source: LeadSource;
  status: LeadStatus;
  sub_status: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  notes: string | null;
  original_email_id: string | null;
  original_email_body: string | null;
  ai_confidence: number | null;
  financial_status: FinancialStatus;
  client_type: ClientType | null;
  start_date: string | null;
  /** set when the lead moves to EMPLOYMENT_ENDED */
  employment_end_date: string | null;
  recruitment_status: RecruitmentStatus;
  rejection_reason: string | null;
  hired_client: string | null;
  hired_position: string | null;
  arrival_date: string | null;
  interview_date: string | null;
  interview_type: "phone" | "in_person" | "video" | null;
  interview_notes: string | null;
  followup_notes: string | null;
  screening_score: number | null;
  human_approval: boolean;
  tags: string[] | null;
  preferences: Record<string, unknown> | null;
  is_candidate: boolean;
  /** email of the recruiter who last moved the lead's status (see changeLeadStatus) */
  handled_by: string | null;
  handled_at: string | null;
  last_contact_at: string | null;
  needs_attention: boolean;
  needs_attention_at: string | null;
  attention_reason: string | null;
  // ── Phase 4: Recruitment Agent v2 ───────────────────────────
  needs_human_attention: boolean;
  human_attention_reason: string | null;
  human_attention_raised_at: string | null;
  screening_motivation_score: number | null;
  screening_fit_score: number | null;
  screening_availability_score: number | null;
  screening_experience_score: number | null;
  extracted_availability: string | null;
  extracted_salary_expectation: string | null;
  extracted_location_pref: string | null;
  extracted_interests: string[] | null;
}

export interface StatusChange {
  id: string;
  lead_id: string;
  from_status: LeadStatus;
  to_status: LeadStatus;
  changed_by: string | null;
  changed_at: string;
  notes: string | null;
}

export interface AIParseResult {
  is_lead: boolean;
  name: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  experience: string | null;
  age: number | null;
  job_title: string | null;
  confidence: number;
}

// ── Conversation Mode types ─────────────────────────────────

export type InteractionType = "call_in" | "call_out" | "whatsapp";
export type InteractionOutcome = "request" | "complaint" | "update" | "other";
export type ReminderPriority = "high" | "normal";

export interface InteractionLog {
  id: string;
  lead_id: string;
  type: InteractionType;
  outcome: InteractionOutcome;
  notes: string | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  lead_id: string;
  title: string;
  due_date: string;
  is_completed: boolean;
  priority: ReminderPriority;
  created_at: string;
}

export interface CommunicationLog {
  id: string;
  lead_id: string;
  channel: "whatsapp" | "email" | "phone";
  direction: "incoming" | "outgoing";
  message: string;
  sent_at: string;
  status: "sent" | "delivered" | "read" | "failed";
}
