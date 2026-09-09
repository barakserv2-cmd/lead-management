-- 00086: when a candidate postpones ("דחה הגעה") to a new interview date, the
-- lead must appear on BOTH days — the original appointment day (where they
-- postponed) and the new day — on the interviews board and in the Excel
-- report. interview_date holds the NEW date; postponed_from_date preserves the
-- ORIGINAL so the second day can be rendered from the same lead row.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS postponed_from_date timestamptz;

-- index the original-date lookups the board / export do
CREATE INDEX IF NOT EXISTS idx_leads_postponed_from_date
  ON public.leads (postponed_from_date)
  WHERE postponed_from_date IS NOT NULL;
