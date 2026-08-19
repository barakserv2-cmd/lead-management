-- 00048: secondary phone number per candidate (second SIM, parent, roommate…).
-- Normalized the same way as the primary phone (00047), not unique.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone2 TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_phone2 ON public.leads (phone2) WHERE phone2 IS NOT NULL;

CREATE OR REPLACE FUNCTION public.leads_normalize_phone_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone  := public.normalize_phone(NEW.phone);
  NEW.phone2 := public.normalize_phone(NEW.phone2);
  IF NEW.phone2 IS NOT NULL AND NEW.phone2 = NEW.phone THEN NEW.phone2 := NULL; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_normalize_phone ON public.leads;
CREATE TRIGGER trg_leads_normalize_phone
  BEFORE INSERT OR UPDATE OF phone, phone2 ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_normalize_phone_trg();
