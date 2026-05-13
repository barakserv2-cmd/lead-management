-- ============================================================
-- Migration: Lead assignment lock
-- Description: Lets a coordinator "claim" a lead so two
--              coordinators don't work the same candidate.
--              assigned_to already exists. assigned_at is the
--              timestamp of the claim — used by the lazy
--              auto-release rule (24h since claim).
-- ============================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads (assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_at ON leads (assigned_at);
