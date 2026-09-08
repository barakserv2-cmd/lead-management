-- 00045: add a new lead status "מספר לא תקין" (INVALID_PHONE) — for leads whose
-- phone number is wrong/unreachable. Extend the CHECK constraint to allow it.

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS chk_lead_status;
ALTER TABLE public.leads ADD CONSTRAINT chk_lead_status CHECK (
  status = ANY (ARRAY[
    'NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS','FIT_FOR_INTERVIEW','INTERVIEW_BOOKED',
    'ARRIVED','HIRED','STARTED','NO_SHOW','REJECTED','LOST_CONTACT','NOT_SUITABLE','INVALID_PHONE'
  ]::text[])
);
