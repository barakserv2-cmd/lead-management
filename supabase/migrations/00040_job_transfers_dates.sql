-- 00040: job transfers carry the work periods payroll needs:
--   from_start_date — when the worker started at the previous employer
--   to_start_date   — when they started at the new one (= transferred_at)
-- and the auto trigger dates the transfer by the NEW start_date (when it was
-- updated in the same save), not by "today".
ALTER TABLE public.job_transfers
  ADD COLUMN IF NOT EXISTS from_start_date DATE,
  ADD COLUMN IF NOT EXISTS to_start_date   DATE;

CREATE OR REPLACE FUNCTION public.log_job_transfer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_when DATE;
BEGIN
  IF OLD.hired_client IS NOT NULL
     AND NEW.hired_client IS NOT NULL
     AND (OLD.hired_client IS DISTINCT FROM NEW.hired_client
          OR OLD.hired_position IS DISTINCT FROM NEW.hired_position)
  THEN
    -- If the recruiter set a new start date in the same save, that is the transfer date.
    v_when := CASE
      WHEN NEW.start_date IS NOT NULL AND NEW.start_date IS DISTINCT FROM OLD.start_date THEN NEW.start_date
      ELSE (now() AT TIME ZONE 'Asia/Jerusalem')::date
    END;

    INSERT INTO public.job_transfers
      (lead_id, from_client, from_position, to_client, to_position,
       transferred_at, from_start_date, to_start_date, source, created_by)
    VALUES
      (NEW.id, OLD.hired_client, OLD.hired_position, NEW.hired_client, NEW.hired_position,
       v_when, OLD.start_date, v_when, 'auto', NEW.handled_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_job_transfer ON public.leads;
CREATE TRIGGER trg_log_job_transfer
  AFTER UPDATE OF hired_client, hired_position, start_date ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_job_transfer();
