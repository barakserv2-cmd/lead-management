-- ============================================================
-- Migration 00017: Create messages table for chat history
-- Stores conversation history between the AI recruiter and leads.
-- ============================================================

-- Create the messages table
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by lead (ordered chronologically)
CREATE INDEX idx_messages_lead_id ON messages (lead_id, created_at ASC);

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS policies (match the leads table pattern: allow authenticated + anon full access)
CREATE POLICY "Authenticated users can read messages"
  ON messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert messages"
  ON messages FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Anon can read messages"
  ON messages FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can insert messages"
  ON messages FOR INSERT TO anon WITH CHECK (true);
