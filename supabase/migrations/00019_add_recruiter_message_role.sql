-- ============================================================
-- Migration 00019: Add 'recruiter' role to messages table
-- Allows human recruiters to send messages via the CRM chat.
-- ============================================================

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_role_check
  CHECK (role IN ('user', 'assistant', 'system', 'recruiter'));
