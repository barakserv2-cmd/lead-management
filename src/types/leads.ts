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
  name: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  experience: string | null;
  age: number | null;
  job_title: string | null;
  source: LeadSource;
  status: LeadStatus;
  sub_status: string | null;
  assigned_to: string | null;
  notes: string | null;
  original_email_id: string | null;
  original_email_body: string | null;
  ai_confidence: number | null;
  financial_status: FinancialStatus;
  client_type: ClientType | null;
  active_jobs_count: number;
  active_employees_count: number;
  recruitment_status: RecruitmentStatus;
  rejection_reason: string | null;
  preferences: Record<string, unknown> | null;
}

export interface StatusChange {
  id: string;
  lead_id: string;
  from_status: LeadStatus;
  to_status: LeadStatus;
  changed_by: string;
  changed_at: string;
  reason: string | null;
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
