-- ============================================================
-- Migration: Create lead_notes table for internal notes log
-- Description: Stores timestamped internal notes per lead,
--              replacing the single-field notes approach with
--              a chronological log.
-- ============================================================

CREATE TABLE lead_notes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_notes_lead_id    ON lead_notes (lead_id);
CREATE INDEX idx_lead_notes_created_at ON lead_notes (created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_lead_notes"
  ON lead_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_lead_notes"
  ON lead_notes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_delete_lead_notes"
  ON lead_notes FOR DELETE TO authenticated USING (true);

CREATE POLICY "anon_select_lead_notes"
  ON lead_notes FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_lead_notes"
  ON lead_notes FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_delete_lead_notes"
  ON lead_notes FOR DELETE TO anon USING (true);
