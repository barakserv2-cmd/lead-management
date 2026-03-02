-- ============================================================
-- Migration 00016: Phase 1 – Strict State Machine Statuses
-- 1. Convert status column from old Hebrew enum to TEXT with CHECK constraint
-- 2. Map existing data to new English statuses
-- 3. Add screening_score and human_approval columns for guardrails
-- 4. Enhance lead_status_history with changed_by and notes
-- ============================================================

-- Step 1: Convert status column from enum to TEXT
ALTER TABLE leads ALTER COLUMN status DROP DEFAULT;
ALTER TABLE leads ALTER COLUMN status TYPE TEXT USING status::TEXT;

-- Step 2: Map old Hebrew statuses to new English statuses
UPDATE leads SET status = 'CONTACTED'        WHERE status = 'מעקב';
UPDATE leads SET status = 'INTERVIEW_BOOKED' WHERE status = 'ראיון במשרד';
UPDATE leads SET status = 'HIRED'            WHERE status = 'התקבל';
UPDATE leads SET status = 'REJECTED'         WHERE status = 'לא רלוונטי';
UPDATE leads SET status = 'NEW_LEAD'         WHERE status = 'חדש';
-- Catch-all for any remaining old values
UPDATE leads SET status = 'NEW_LEAD'
  WHERE status NOT IN (
    'NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS','FIT_FOR_INTERVIEW',
    'INTERVIEW_BOOKED','ARRIVED','HIRED','STARTED','NO_SHOW','REJECTED','LOST_CONTACT'
  );

-- Step 3: Add CHECK constraint for strict statuses
ALTER TABLE leads ADD CONSTRAINT chk_lead_status CHECK (
  status IN (
    'NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS','FIT_FOR_INTERVIEW',
    'INTERVIEW_BOOKED','ARRIVED','HIRED','STARTED','NO_SHOW','REJECTED','LOST_CONTACT'
  )
);

-- Step 4: Set the new default
ALTER TABLE leads ALTER COLUMN status SET DEFAULT 'NEW_LEAD';

-- Step 5: Add guardrail columns for the state machine
ALTER TABLE leads ADD COLUMN IF NOT EXISTS screening_score SMALLINT CHECK (screening_score >= 0 AND screening_score <= 100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS human_approval BOOLEAN DEFAULT FALSE;

-- Step 6: Enhance lead_status_history table
--   Convert from_status / to_status from enum to TEXT
ALTER TABLE lead_status_history ALTER COLUMN from_status TYPE TEXT USING from_status::TEXT;
ALTER TABLE lead_status_history ALTER COLUMN to_status TYPE TEXT USING to_status::TEXT;

--   Add changed_by and notes columns
ALTER TABLE lead_status_history ADD COLUMN IF NOT EXISTS changed_by TEXT;
ALTER TABLE lead_status_history ADD COLUMN IF NOT EXISTS notes TEXT;

-- Step 7: Update history records to match new status names
UPDATE lead_status_history SET from_status = 'CONTACTED'        WHERE from_status = 'מעקב';
UPDATE lead_status_history SET from_status = 'INTERVIEW_BOOKED' WHERE from_status = 'ראיון במשרד';
UPDATE lead_status_history SET from_status = 'HIRED'            WHERE from_status = 'התקבל';
UPDATE lead_status_history SET from_status = 'REJECTED'         WHERE from_status = 'לא רלוונטי';
UPDATE lead_status_history SET from_status = 'NEW_LEAD'         WHERE from_status = 'חדש';
UPDATE lead_status_history SET to_status = 'CONTACTED'          WHERE to_status = 'מעקב';
UPDATE lead_status_history SET to_status = 'INTERVIEW_BOOKED'   WHERE to_status = 'ראיון במשרד';
UPDATE lead_status_history SET to_status = 'HIRED'              WHERE to_status = 'התקבל';
UPDATE lead_status_history SET to_status = 'REJECTED'           WHERE to_status = 'לא רלוונטי';
UPDATE lead_status_history SET to_status = 'NEW_LEAD'           WHERE to_status = 'חדש';

-- Drop the old enum type (no longer used by any column)
DROP TYPE IF EXISTS lead_status;
