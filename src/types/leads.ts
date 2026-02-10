import type { LeadStatus, LeadSource } from "@/lib/constants";

export interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  experience: string | null;
  age: number | null;
  job_title: string | null;
  source: LeadSource;
  status: LeadStatus;
  assigned_to: string | null;
  notes: string | null;
  original_email_id: string | null;
  original_email_body: string | null;
  ai_confidence: number | null;
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

export interface CommunicationLog {
  id: string;
  lead_id: string;
  channel: "whatsapp" | "email" | "phone";
  direction: "incoming" | "outgoing";
  message: string;
  sent_at: string;
  status: "sent" | "delivered" | "read" | "failed";
}
