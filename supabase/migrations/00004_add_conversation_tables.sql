-- ============================================================
-- Migration: Add conversation tables (interaction_logs, reminders)
-- Description: Support "Conversation Mode" side-sheet with
--              interaction history, reminders, and quick actions.
-- ============================================================

-- ── ENUM types ──────────────────────────────────────────────

CREATE TYPE interaction_type AS ENUM ('call_in', 'call_out', 'whatsapp');
CREATE TYPE interaction_outcome AS ENUM ('request', 'complaint', 'update', 'other');
CREATE TYPE reminder_priority AS ENUM ('high', 'normal');

-- ── interaction_logs ────────────────────────────────────────

CREATE TABLE interaction_logs (
  id         UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID            NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type       interaction_type   NOT NULL,
  outcome    interaction_outcome NOT NULL DEFAULT 'other',
  notes      TEXT,
  created_at TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_interaction_logs_lead_id    ON interaction_logs (lead_id);
CREATE INDEX idx_interaction_logs_created_at ON interaction_logs (created_at DESC);

-- ── reminders ───────────────────────────────────────────────

CREATE TABLE reminders (
  id           UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID              NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title        TEXT              NOT NULL,
  due_date     TIMESTAMPTZ       NOT NULL,
  is_completed BOOLEAN           NOT NULL DEFAULT false,
  priority     reminder_priority NOT NULL DEFAULT 'normal',
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_lead_id  ON reminders (lead_id);
CREATE INDEX idx_reminders_due_date ON reminders (due_date);

-- ── RLS — interaction_logs ──────────────────────────────────

ALTER TABLE interaction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_interaction_logs"
  ON interaction_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_interaction_logs"
  ON interaction_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_interaction_logs"
  ON interaction_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete_interaction_logs"
  ON interaction_logs FOR DELETE TO authenticated USING (true);

CREATE POLICY "anon_select_interaction_logs"
  ON interaction_logs FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_interaction_logs"
  ON interaction_logs FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_interaction_logs"
  ON interaction_logs FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── RLS — reminders ─────────────────────────────────────────

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_reminders"
  ON reminders FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_reminders"
  ON reminders FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_reminders"
  ON reminders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete_reminders"
  ON reminders FOR DELETE TO authenticated USING (true);

CREATE POLICY "anon_select_reminders"
  ON reminders FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_reminders"
  ON reminders FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_reminders"
  ON reminders FOR UPDATE TO anon USING (true) WITH CHECK (true);
