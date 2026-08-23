-- 00052: new lead status EMPLOYMENT_ENDED ("סיום העסקה") + end-of-employment
-- date, set from the hired report when a placed worker stops working.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS employment_end_date DATE;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS chk_lead_status;
ALTER TABLE public.leads ADD CONSTRAINT chk_lead_status CHECK (
  status = ANY (ARRAY[
    'NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS','FIT_FOR_INTERVIEW','INTERVIEW_BOOKED',
    'ARRIVED','HIRED','STARTED','NO_SHOW','REJECTED','LOST_CONTACT','NOT_SUITABLE',
    'INVALID_PHONE','EMPLOYMENT_ENDED'
  ]::text[])
);
