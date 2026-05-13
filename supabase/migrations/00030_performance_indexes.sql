-- ============================================================
-- Migration: Performance indexes
-- Description: Adds the indexes the existing queries assume.
--              Biggest wins: status (board view filter),
--              created_at (default order), is_candidate (every
--              leads list query), and pg_trgm-backed indexes on
--              name/phone/job_title for the ILIKE search bar.
-- ============================================================

-- Trigram extension for fast ILIKE on Hebrew/English text
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Status: used by board column counts + status-filter queries
CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads (status);

-- Default sort
CREATE INDEX IF NOT EXISTS idx_leads_created_at  ON leads (created_at DESC);

-- Every list query filters by this; partial index keeps it tiny
CREATE INDEX IF NOT EXISTS idx_leads_candidates  ON leads (created_at DESC) WHERE is_candidate = true;

-- Tag overlap queries
CREATE INDEX IF NOT EXISTS idx_leads_tags        ON leads USING GIN (tags);

-- Search bar (name / phone / job_title use ILIKE '%...%')
CREATE INDEX IF NOT EXISTS idx_leads_name_trgm      ON leads USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm     ON leads USING GIN (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_job_title_trgm ON leads USING GIN (job_title gin_trgm_ops);
