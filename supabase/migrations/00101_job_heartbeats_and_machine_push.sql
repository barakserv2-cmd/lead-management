-- 00101: know when an automated job stops, and know which leads reached גובגט.
--
-- Review committee 29/09, month-1 items 1 and 2:
--
-- 1. Nothing told anyone when a job failed. The crons return 200 even when
--    every send failed, Sentry was never wired, and on 29–30/09 the business
--    WhatsApp instance was deleted and 13 interview reminders failed with no
--    alert. job_heartbeats records every run of every cron (last success, last
--    error, consecutive failures) so a watchdog can alert once per incident.
--
-- 2. cron/sync-new-leads pushed only the last 3 minutes of leads, never
--    checked the answer, and kept no record. When גובגט was down longer than
--    that (14–16/09), those leads never reached it. The machine_push_* columns
--    are an outbox: a lead counts as pushed only after a 2xx from גובגט, and a
--    failed push is retried with backoff.

-- ── job_heartbeats ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_heartbeats (
  job                  text PRIMARY KEY,
  last_run_at          timestamptz,
  last_ok_at           timestamptz,
  last_error_at        timestamptz,
  last_error           text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  -- set when the watchdog has alerted about this job; cleared on recovery
  alert_open_since     timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- service role only (crons and the watchdog); no policies on purpose
ALTER TABLE public.job_heartbeats ENABLE ROW LEVEL SECURITY;

-- One statement per run, so concurrent runs can't lose an increment.
CREATE OR REPLACE FUNCTION public.record_job_run(p_job text, p_ok boolean, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.job_heartbeats AS h
    (job, last_run_at, last_ok_at, last_error_at, last_error, consecutive_failures, updated_at)
  VALUES (
    p_job, now(),
    CASE WHEN p_ok THEN now() END,
    CASE WHEN p_ok THEN NULL ELSE now() END,
    CASE WHEN p_ok THEN NULL ELSE left(p_error, 500) END,
    CASE WHEN p_ok THEN 0 ELSE 1 END,
    now()
  )
  ON CONFLICT (job) DO UPDATE SET
    last_run_at          = now(),
    last_ok_at           = CASE WHEN p_ok THEN now() ELSE h.last_ok_at END,
    last_error_at        = CASE WHEN p_ok THEN h.last_error_at ELSE now() END,
    last_error           = CASE WHEN p_ok THEN h.last_error ELSE left(p_error, 500) END,
    consecutive_failures = CASE WHEN p_ok THEN 0 ELSE h.consecutive_failures + 1 END,
    updated_at           = now();
$$;

REVOKE ALL ON FUNCTION public.record_job_run(text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_job_run(text, boolean, text) TO service_role;

-- ── leads: push-to-גובגט outbox ────────────────────────────────
-- machine_pushed_at NULL = still to do. It is set when the lead is resolved:
-- pushed (note 'sent'), deliberately not pushed ('skip:<reason>') or refused
-- by גובגט as invalid ('rejected:<status>').
--
-- Rows that exist now were already handled by the old 3-minute cron and the
-- stale sweep, so they start resolved ('pre-outbox'). Done through a column
-- DEFAULT, not an UPDATE: the default is filled in without touching the rows,
-- so leads_updated_at doesn't fire and no lead looks "updated today". The
-- defaults are dropped right after, so new leads start NULL (to do).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS machine_pushed_at     timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS machine_push_note     text DEFAULT 'pre-outbox',
  ADD COLUMN IF NOT EXISTS machine_push_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS machine_push_next_at  timestamptz,
  ADD COLUMN IF NOT EXISTS machine_push_error    text;

ALTER TABLE public.leads
  ALTER COLUMN machine_pushed_at DROP DEFAULT,
  ALTER COLUMN machine_push_note DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_leads_machine_push_pending
  ON public.leads (created_at)
  WHERE machine_pushed_at IS NULL;
