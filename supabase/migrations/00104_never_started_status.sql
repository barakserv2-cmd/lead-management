-- 00104: new lead status NEVER_STARTED ("לא התחיל לעבוד") — a candidate who
-- was hired but never actually started. Until now these were closed as
-- EMPLOYMENT_ENDED ("סיום העסקה"), which reads as if they worked (מלי, 05.10:
-- 17 such leads never passed through STARTED, 12 "ended" within 3 days).
-- The reason is mandatory (set by the dialog, enforced in changeLeadStatus)
-- and stays on the lead for the follow-up report.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS never_started_reason TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS never_started_notes TEXT;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS chk_lead_status;
ALTER TABLE public.leads ADD CONSTRAINT chk_lead_status CHECK (
  status = ANY (ARRAY[
    'NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS','FIT_FOR_INTERVIEW','INTERVIEW_BOOKED',
    'ARRIVED','HIRED','STARTED','NO_SHOW','CANCELLED_ARRIVAL','POSTPONED_ARRIVAL',
    'NOT_ACCEPTED','REJECTED','LOST_CONTACT','NOT_SUITABLE','INVALID_PHONE','EMPLOYMENT_ENDED',
    'NEVER_STARTED'
  ]::text[])
);
