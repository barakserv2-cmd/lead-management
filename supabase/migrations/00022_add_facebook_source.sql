-- ============================================================
-- Migration: Add 'פייסבוק' to lead_source enum
-- Description: New leads from FB Jobs (via Zapier) need their
--              own source tag instead of being grouped under AllJobs.
-- Note: Postgres requires the new enum value to be added in a
--       separate transaction before it can be used. The backfill
--       lives in 00023.
-- ============================================================

ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'פייסבוק';
