-- ============================================================
-- Migration: Add NOT_SUITABLE status
-- Description: New top-level status "לא מתאים" with its own
--              sub-statuses (handled in app code).
-- ============================================================

ALTER TABLE leads DROP CONSTRAINT IF EXISTS chk_lead_status;

ALTER TABLE leads ADD CONSTRAINT chk_lead_status CHECK (
  status IN (
    'NEW_LEAD',
    'CONTACTED',
    'SCREENING_IN_PROGRESS',
    'FIT_FOR_INTERVIEW',
    'INTERVIEW_BOOKED',
    'ARRIVED',
    'HIRED',
    'STARTED',
    'NO_SHOW',
    'REJECTED',
    'LOST_CONTACT',
    'NOT_SUITABLE'
  )
);
