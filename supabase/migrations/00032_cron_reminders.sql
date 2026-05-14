-- ============================================================
-- Migration: cron_reminders log
-- Description: Tracks every automated reminder/cleanup the
--              daily cron sent. Used for idempotency (don't
--              re-send the same WhatsApp twice) and for audit.
-- ============================================================

CREATE TABLE IF NOT EXISTS cron_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  -- Unique key per reminder occurrence, e.g. interview_<date>_<lead_id>.
  -- Prevents duplicate sends if the cron runs more than once.
  occurrence_key TEXT NOT NULL UNIQUE,
  payload       JSONB,
  success       BOOLEAN NOT NULL DEFAULT true,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_reminders_lead_id ON cron_reminders (lead_id);
CREATE INDEX IF NOT EXISTS idx_cron_reminders_created ON cron_reminders (created_at DESC);

ALTER TABLE cron_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cron_reminders_authenticated_read" ON cron_reminders
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cron_reminders_anon_read" ON cron_reminders
  FOR SELECT TO anon USING (true);
