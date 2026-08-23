-- 00054: manual, recruiter-scheduled WhatsApp reminders to candidates.
-- A recruiter picks a time + text on the lead's chat; /api/cron/scheduled
-- (every 5 min) sends anything due from the recruiter's own number.

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  send_at     timestamptz NOT NULL,
  message     text NOT NULL,
  created_by  text NOT NULL,                 -- recruiter email (sender)
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','sent','failed','cancelled')),
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
  ON public.scheduled_messages (send_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_lead
  ON public.scheduled_messages (lead_id, send_at);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
-- service role only (API routes enforce per-recruiter visibility).
