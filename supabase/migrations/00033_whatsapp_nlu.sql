-- ============================================================
-- Migration: WhatsApp NLU storage
-- Description: Adds AI-extracted intent + entities to each
--              incoming message, plus a `needs_attention` flag
--              on the lead so the recruiter cockpit can surface
--              messages that require a human.
-- ============================================================

-- Per-message NLU result. Cheap to add since messages already has JSONB.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS ai_intent     TEXT,
  ADD COLUMN IF NOT EXISTS ai_entities   JSONB,
  ADD COLUMN IF NOT EXISTS ai_confidence REAL CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  ADD COLUMN IF NOT EXISTS ai_summary    TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_ai_intent ON messages (ai_intent) WHERE ai_intent IS NOT NULL;

-- Lead-level "needs attention" flag the NLU sets when it can't
-- handle a message on its own.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS needs_attention      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_attention_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attention_reason     TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_needs_attention
  ON leads (needs_attention_at DESC) WHERE needs_attention = true;
