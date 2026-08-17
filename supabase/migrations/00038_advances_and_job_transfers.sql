-- 00038: reports data — salary advances (מקדמות) and job transfers (העברות בין עבודות).
-- Both are per-lead ledgers. job_transfers is ALSO auto-populated by a trigger
-- whenever leads.hired_client / hired_position changes on an already-placed worker,
-- so the transfers report stays complete even when a recruiter just edits the card.

-- ── advances ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.advances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  paid_at     DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jerusalem')::date,
  employer    TEXT,                    -- snapshot of hired_client at time of payment
  notes       TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_advances_lead_id ON public.advances (lead_id);
CREATE INDEX IF NOT EXISTS idx_advances_paid_at ON public.advances (paid_at DESC);

ALTER TABLE public.advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_advances" ON public.advances;
CREATE POLICY "authenticated_all_advances" ON public.advances
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── job_transfers ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_client     TEXT,
  from_position   TEXT,
  to_client       TEXT,
  to_position     TEXT,
  transferred_at  DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jerusalem')::date,
  reason          TEXT,
  source          TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'auto'
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_transfers_lead_id ON public.job_transfers (lead_id);
CREATE INDEX IF NOT EXISTS idx_job_transfers_at ON public.job_transfers (transferred_at DESC);

ALTER TABLE public.job_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_job_transfers" ON public.job_transfers;
CREATE POLICY "authenticated_all_job_transfers" ON public.job_transfers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Auto-log a transfer when a placed worker's employer/position changes.
CREATE OR REPLACE FUNCTION public.log_job_transfer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.hired_client IS NOT NULL
     AND (OLD.hired_client IS DISTINCT FROM NEW.hired_client
          OR OLD.hired_position IS DISTINCT FROM NEW.hired_position)
     AND NEW.hired_client IS NOT NULL
  THEN
    INSERT INTO public.job_transfers (lead_id, from_client, from_position, to_client, to_position, source, created_by)
    VALUES (NEW.id, OLD.hired_client, OLD.hired_position, NEW.hired_client, NEW.hired_position, 'auto', NEW.handled_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_job_transfer ON public.leads;
CREATE TRIGGER trg_log_job_transfer
  AFTER UPDATE OF hired_client, hired_position ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_job_transfer();
