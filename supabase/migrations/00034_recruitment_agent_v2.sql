-- ============================================================
-- Migration 00034: Recruitment Agent v2
-- Description: Multi-dimensional scoring, AI-extracted fields,
--              and a separate human-escalation flag specific to
--              the AI screening conversation.
-- Note: Phase-3 added a generic `needs_attention` flag for NLU
--       on any incoming message. This Phase-4 flag
--       (`needs_human_attention`) is set only by the screening
--       agent when it decides to hand off the conversation.
-- ============================================================

-- ── Human escalation from the screening agent ───────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS needs_human_attention      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS human_attention_reason     TEXT,
  ADD COLUMN IF NOT EXISTS human_attention_raised_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_needs_human
  ON leads (human_attention_raised_at DESC)
  WHERE needs_human_attention = TRUE;

-- ── Multi-dimensional screening scores ──────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS screening_motivation_score   SMALLINT CHECK (screening_motivation_score   BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS screening_fit_score          SMALLINT CHECK (screening_fit_score          BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS screening_availability_score SMALLINT CHECK (screening_availability_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS screening_experience_score   SMALLINT CHECK (screening_experience_score   BETWEEN 0 AND 100);

-- ── Fields extracted by the agent during the chat ───────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS extracted_availability       TEXT,
  ADD COLUMN IF NOT EXISTS extracted_salary_expectation TEXT,
  ADD COLUMN IF NOT EXISTS extracted_location_pref      TEXT,
  ADD COLUMN IF NOT EXISTS extracted_interests          TEXT[];
