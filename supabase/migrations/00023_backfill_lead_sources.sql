-- ============================================================
-- Migration: Backfill source for existing leads
-- Description: Up to now every lead from Gmail was tagged
--              'AllJobs' regardless of where the email came from.
--              Re-classify based on the stored email body.
-- Note: This migration is idempotent — running it again only
--       moves rows whose body still matches a different bucket.
-- ============================================================

-- 1) Mark FB leads first (avoid overwriting later)
UPDATE leads
SET source = 'פייסבוק'
WHERE original_email_body IS NOT NULL
  AND (
    original_email_body ILIKE '%FB JOBS%'
    OR original_email_body ILIKE '%FBJOBS%'
    OR original_email_body ILIKE '%facebook.com%'
    OR original_email_body ILIKE '%via Zapier%'
    OR original_email_body ILIKE '%powered by Zapier%'
  );

-- 2) Anything left whose body doesn't reference AllJobs becomes "אימייל ישיר"
UPDATE leads
SET source = 'אימייל ישיר'
WHERE original_email_body IS NOT NULL
  AND original_email_body NOT ILIKE '%alljob%'
  AND source <> 'פייסבוק';

-- 3) Lock anything that does reference AllJobs to that value (safety)
UPDATE leads
SET source = 'AllJobs'
WHERE original_email_body IS NOT NULL
  AND original_email_body ILIKE '%alljob%'
  AND source <> 'פייסבוק';
