-- ============================================================
-- Migration: Create jobs table
-- Description: Operational job availability for rapid staffing.
-- ============================================================

CREATE TABLE jobs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  needed_count   INTEGER     NOT NULL DEFAULT 1 CHECK (needed_count >= 1),
  assigned_count INTEGER     NOT NULL DEFAULT 0 CHECK (assigned_count >= 0),
  pay_rate       TEXT,
  location       TEXT,
  requirements   TEXT[]      DEFAULT '{}',
  urgent         BOOLEAN     NOT NULL DEFAULT false,
  status         TEXT        NOT NULL DEFAULT 'Open'
                             CHECK (status IN ('Open', 'Closed', 'On Hold')),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraint: assigned cannot exceed needed
ALTER TABLE jobs ADD CONSTRAINT chk_assigned_lte_needed
  CHECK (assigned_count <= needed_count);

CREATE INDEX idx_jobs_client_id ON jobs (client_id);
CREATE INDEX idx_jobs_status    ON jobs (status);
CREATE INDEX idx_jobs_urgent    ON jobs (urgent);

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_jobs"
  ON jobs FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_jobs"
  ON jobs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_jobs"
  ON jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete_jobs"
  ON jobs FOR DELETE TO authenticated USING (true);

CREATE POLICY "anon_select_jobs"
  ON jobs FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_jobs"
  ON jobs FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_jobs"
  ON jobs FOR UPDATE TO anon USING (true) WITH CHECK (true);
