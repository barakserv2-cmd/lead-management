-- ============================================================
-- Migration: Store original email From and Subject
-- Description: Until now only original_email_body was stored,
--              which makes it hard to retroactively classify the
--              source of a lead. Going forward we also save the
--              From header and Subject so detectSource() has full
--              signal even on legacy reprocessing.
-- ============================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS original_email_from    TEXT,
  ADD COLUMN IF NOT EXISTS original_email_subject TEXT;
