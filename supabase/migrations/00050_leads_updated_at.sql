-- 00050: restore leads.updated_at — defined in 00001 but missing from the live
-- (Frankfurt) DB, so the /leads list query broke the moment it selected the
-- column. Recreates column + auto-update trigger and backfills a meaningful
-- value (handled_at when a recruiter touched the lead, else created_at) instead
-- of stamping every historical row with the migration time.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill BEFORE creating the trigger so it isn't overwritten with now().
UPDATE public.leads
SET updated_at = GREATEST(created_at, COALESCE(handled_at, created_at));

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON public.leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
