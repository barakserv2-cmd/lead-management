-- 00085: two new interview-outcome statuses set from the interviews board —
-- CANCELLED_ARRIVAL ("ביטל הגעה", candidate proactively cancelled) and
-- POSTPONED_ARRIVAL ("דחה הגעה", wants to reschedule). Kept distinct from
-- NO_SHOW ("didn't show, silent") so cancellations and postponements can be
-- tracked and reported apart.

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS chk_lead_status;
ALTER TABLE public.leads ADD CONSTRAINT chk_lead_status CHECK (
  status = ANY (ARRAY[
    'NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS','FIT_FOR_INTERVIEW','INTERVIEW_BOOKED',
    'ARRIVED','HIRED','STARTED','NO_SHOW','CANCELLED_ARRIVAL','POSTPONED_ARRIVAL',
    'NOT_ACCEPTED','REJECTED','LOST_CONTACT','NOT_SUITABLE','INVALID_PHONE','EMPLOYMENT_ENDED'
  ]::text[])
);
