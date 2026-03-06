-- ============================================================
-- Migration 00020: Add start_date, remove B2B count columns
-- Adds optional start_date for candidate's work start date.
-- Removes active_jobs_count and active_employees_count (B2B leftover).
-- ============================================================

ALTER TABLE leads ADD COLUMN start_date DATE;

ALTER TABLE leads DROP COLUMN IF EXISTS active_jobs_count;
ALTER TABLE leads DROP COLUMN IF EXISTS active_employees_count;
