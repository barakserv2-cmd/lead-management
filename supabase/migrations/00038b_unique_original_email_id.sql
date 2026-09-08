-- 00038: guard against duplicate ingestion when the scraper runs frequently.
-- Moving from a once-daily cron to every-few-minutes means two runs can overlap;
-- the existingByEmailId check is not atomic, so a race could insert the same
-- email twice. A partial unique index makes the second insert fail cleanly
-- (handled by the route's insertError branch) instead of creating a dup lead.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_leads_original_email_id
  ON public.leads (original_email_id)
  WHERE original_email_id IS NOT NULL;
