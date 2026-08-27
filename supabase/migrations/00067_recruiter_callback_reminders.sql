-- 00066: self-reminders for recruiters ("להתקשר שוב").
--
-- The reminders table already existed but held no owner, so a reminder could
-- not be shown to the recruiter who set it — and nothing ever wrote to it
-- (0 rows). Adding the owner turns it into a per-recruiter call-back list.

ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS recruiter text;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- "מה מחכה לי עכשיו" — the only query the board runs.
CREATE INDEX IF NOT EXISTS idx_reminders_owner_due
  ON public.reminders (recruiter, due_date)
  WHERE is_completed = false;
