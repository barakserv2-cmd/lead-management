-- 00059: new lead status NOT_ACCEPTED ("לא התקבל") — the candidate was
-- interviewed and turned down. Kept separate from REJECTED ("נדחה"), which
-- closes a lead at any other stage, so the two can be reported apart.

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS chk_lead_status;
ALTER TABLE public.leads ADD CONSTRAINT chk_lead_status CHECK (
  status = ANY (ARRAY[
    'NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS','FIT_FOR_INTERVIEW','INTERVIEW_BOOKED',
    'ARRIVED','HIRED','STARTED','NO_SHOW','NOT_ACCEPTED','REJECTED','LOST_CONTACT',
    'NOT_SUITABLE','INVALID_PHONE','EMPLOYMENT_ENDED'
  ]::text[])
);
