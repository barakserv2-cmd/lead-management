-- 00036: sort leads by the real email send date, not ingestion time.
-- Old unread emails (some from 2023) get ingested with created_at = now(),
-- so they wrongly float to the top. We now capture the email's Date header
-- and sort by COALESCE(email_date, created_at) so leads appear in true
-- arrival order (newest first). Non-email leads keep using created_at.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_date timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS effective_at timestamptz
  GENERATED ALWAYS AS (COALESCE(email_date, created_at)) STORED;

CREATE INDEX IF NOT EXISTS idx_leads_effective_at
  ON public.leads (effective_at DESC);
