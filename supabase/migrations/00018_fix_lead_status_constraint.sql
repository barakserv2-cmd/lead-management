-- Migration 00018: Fix lead status CHECK constraint
-- Ensures the status column is TEXT with all 11 state-machine statuses.
-- Note: User ran cleanup script manually to fix existing rows before applying constraint.

ALTER TABLE leads DROP CONSTRAINT IF EXISTS chk_lead_status;

DO $$
BEGIN
  ALTER TABLE leads ALTER COLUMN status DROP DEFAULT;
EXCEPTION WHEN others THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE leads ALTER COLUMN status TYPE text USING CAST(status AS text);
EXCEPTION WHEN others THEN
  NULL;
END $$;

UPDATE leads SET status = CASE
  WHEN TRIM(COALESCE(status, '')) IN ('NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS','FIT_FOR_INTERVIEW','INTERVIEW_BOOKED','ARRIVED','HIRED','STARTED','NO_SHOW','REJECTED','LOST_CONTACT')
    THEN TRIM(status)
  ELSE 'NEW_LEAD'
END;

ALTER TABLE leads ALTER COLUMN status SET DEFAULT 'NEW_LEAD';

ALTER TABLE leads ADD CONSTRAINT chk_lead_status CHECK (status IN ('NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS','FIT_FOR_INTERVIEW','INTERVIEW_BOOKED','ARRIVED','HIRED','STARTED','NO_SHOW','REJECTED','LOST_CONTACT'));

ALTER TABLE leads ADD COLUMN IF NOT EXISTS screening_score smallint;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS human_approval boolean DEFAULT false;

DO $$
BEGIN
  ALTER TABLE lead_status_history ALTER COLUMN from_status TYPE text USING CAST(from_status AS text);
EXCEPTION WHEN others THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE lead_status_history ALTER COLUMN to_status TYPE text USING CAST(to_status AS text);
EXCEPTION WHEN others THEN
  NULL;
END $$;

ALTER TABLE lead_status_history ADD COLUMN IF NOT EXISTS changed_by text;
ALTER TABLE lead_status_history ADD COLUMN IF NOT EXISTS notes text;

DROP TYPE IF EXISTS lead_status;
