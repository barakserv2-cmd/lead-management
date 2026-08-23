-- ============================================================
-- Migration: Create messages table for two-way WhatsApp chat
-- Description: Stores inbound and outbound chat messages per
--              lead. Used by the in-app chat UI inside the lead
--              slide-out panel and (eventually) by the WhatsApp
--              webhook for inbound messages.
-- ============================================================

-- Direction enum: who sent the message
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

CREATE TABLE messages (
  id         UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID              NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction  message_direction NOT NULL,
  content    TEXT              NOT NULL,
  created_at TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_messages_lead_id    ON messages (lead_id);
CREATE INDEX idx_messages_created_at ON messages (created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_messages"
  ON messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_messages"
  ON messages FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_messages"
  ON messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete_messages"
  ON messages FOR DELETE TO authenticated USING (true);

CREATE POLICY "anon_select_messages"
  ON messages FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_messages"
  ON messages FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_messages"
  ON messages FOR UPDATE TO anon USING (true) WITH CHECK (true);
