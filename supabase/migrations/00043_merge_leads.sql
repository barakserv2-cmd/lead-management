-- 00043: merge two duplicate lead cards for the same candidate into one.
-- Winner = the card further along the pipeline (tie -> the older/original one).
-- All child rows (history, events, notes, messages, docs, reminders, …) are
-- reassigned to the winner; contact/demographic fields fill the winner's blanks
-- from the loser; notes are concatenated and tags unioned; then the loser is
-- deleted. Runs atomically (function = one transaction). Returns the winner id.

CREATE OR REPLACE FUNCTION public.merge_leads(a uuid, b uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  winner uuid;
  loser  uuid;
  rank_a int; rank_b int;
  ca timestamptz; cb timestamptz;
BEGIN
  IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'both lead ids required'; END IF;
  IF a = b THEN RETURN a; END IF;

  SELECT (CASE status
            WHEN 'STARTED' THEN 10 WHEN 'HIRED' THEN 9 WHEN 'ARRIVED' THEN 7
            WHEN 'INTERVIEW_BOOKED' THEN 6 WHEN 'NO_SHOW' THEN 6
            WHEN 'FIT_FOR_INTERVIEW' THEN 5 WHEN 'SCREENING_IN_PROGRESS' THEN 4
            WHEN 'CONTACTED' THEN 3 WHEN 'REJECTED' THEN 2 WHEN 'LOST_CONTACT' THEN 2
            WHEN 'NOT_SUITABLE' THEN 2 ELSE 1 END), created_at
    INTO rank_a, ca FROM public.leads WHERE id = a;
  SELECT (CASE status
            WHEN 'STARTED' THEN 10 WHEN 'HIRED' THEN 9 WHEN 'ARRIVED' THEN 7
            WHEN 'INTERVIEW_BOOKED' THEN 6 WHEN 'NO_SHOW' THEN 6
            WHEN 'FIT_FOR_INTERVIEW' THEN 5 WHEN 'SCREENING_IN_PROGRESS' THEN 4
            WHEN 'CONTACTED' THEN 3 WHEN 'REJECTED' THEN 2 WHEN 'LOST_CONTACT' THEN 2
            WHEN 'NOT_SUITABLE' THEN 2 ELSE 1 END), created_at
    INTO rank_b, cb FROM public.leads WHERE id = b;

  IF rank_a IS NULL OR rank_b IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;

  IF rank_a > rank_b OR (rank_a = rank_b AND ca <= cb) THEN
    winner := a; loser := b;
  ELSE
    winner := b; loser := a;
  END IF;

  -- free the loser's unique original_email_id before the field-merge so the
  -- partial unique index can't trip on a transient duplicate
  UPDATE public.leads SET original_email_id = NULL WHERE id = loser;

  -- reassign every child table from loser -> winner
  UPDATE public.advances            SET lead_id = winner WHERE lead_id = loser;
  UPDATE public.cron_reminders      SET lead_id = winner WHERE lead_id = loser;
  UPDATE public.interaction_logs    SET lead_id = winner WHERE lead_id = loser;
  UPDATE public.job_transfers       SET lead_id = winner WHERE lead_id = loser;
  UPDATE public.lead_documents      SET lead_id = winner WHERE lead_id = loser;
  UPDATE public.lead_events         SET lead_id = winner WHERE lead_id = loser;
  UPDATE public.lead_notes          SET lead_id = winner WHERE lead_id = loser;
  UPDATE public.lead_status_history SET lead_id = winner WHERE lead_id = loser;
  UPDATE public.messages            SET lead_id = winner WHERE lead_id = loser;
  UPDATE public.reminders           SET lead_id = winner WHERE lead_id = loser;

  -- fill the winner's blanks from the loser; keep the winner's pipeline fields
  UPDATE public.leads w SET
    email      = COALESCE(w.email, l.email),
    phone      = COALESCE(w.phone, l.phone),
    location   = COALESCE(w.location, l.location),
    experience = COALESCE(w.experience, l.experience),
    age        = COALESCE(w.age, l.age),
    job_title  = COALESCE(w.job_title, l.job_title),
    source     = COALESCE(w.source, l.source),
    notes      = NULLIF(concat_ws(E'\n---\n', NULLIF(w.notes, ''), NULLIF(l.notes, '')), ''),
    tags       = (SELECT array(SELECT DISTINCT unnest(COALESCE(w.tags, '{}') || COALESCE(l.tags, '{}'))))
  FROM public.leads l
  WHERE w.id = winner AND l.id = loser;

  DELETE FROM public.leads WHERE id = loser;

  RETURN winner;
END;
$$;
