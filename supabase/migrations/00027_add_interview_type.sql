-- ============================================================
-- Migration: Interview type (in-person vs video)
-- Description: Store whether a scheduled interview is in-person
--              or over video so reports can break it down.
-- ============================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS interview_type TEXT
    CHECK (interview_type IN ('in_person', 'video'));
