-- ============================================================
-- Migration: Link leads to jobs on hire
-- Description: hired_client/hired_position are free text and
--              drift over time. hired_job_id ties a hired lead
--              to the exact job in the jobs table so reports
--              can join cleanly.
-- ============================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS hired_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_hired_job_id ON leads (hired_job_id);
