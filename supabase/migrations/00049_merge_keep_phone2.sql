-- 00049: merge_leads() must not lose the absorbed card's phone number.
-- With phone2 (00048) available, the loser's phone (and its own phone2)
-- fill the winner's phone / phone2 blanks. Also teach find_lead_duplicates()
-- to match on phone2, so a card whose secondary number is another card's
-- primary number surfaces in the "duplicates" banner.

CREATE OR REPLACE FUNCTION public.merge_leads(a uuid, b uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  winner uuid;
  loser  uuid;
  rank_a int; rank_b int;
  ca timestamptz; cb timestamptz;
  l_phone text; l_phone2 text;
BEGIN
  IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'both lead ids required'; END IF;
  IF a = b THEN RETURN a; END IF;

  SELECT (CASE status
            WHEN 'STARTED' THEN 10 WHEN 'HIRED' THEN 9 WHEN 'ARRIVED' THEN 7
            WHEN 'INTERVIEW_BOOKED' THEN 6 WHEN 'NO_SHOW' THEN 6
            WHEN 'FIT_FOR_INTERVIEW' THEN 5 WHEN 'SCREENING_IN_PROGRESS' THEN 4
            WHEN 'CONTACTED' THEN 3 WHEN 'REJECTED' THEN 2 WHEN 'LOST_CONTACT' THEN 2
            WHEN 'NOT_SUITABLE' THEN 2 WHEN 'INVALID_PHONE' THEN 2 ELSE 1 END), created_at
    INTO rank_a, ca FROM public.leads WHERE id = a;
  SELECT (CASE status
            WHEN 'STARTED' THEN 10 WHEN 'HIRED' THEN 9 WHEN 'ARRIVED' THEN 7
            WHEN 'INTERVIEW_BOOKED' THEN 6 WHEN 'NO_SHOW' THEN 6
            WHEN 'FIT_FOR_INTERVIEW' THEN 5 WHEN 'SCREENING_IN_PROGRESS' THEN 4
            WHEN 'CONTACTED' THEN 3 WHEN 'REJECTED' THEN 2 WHEN 'LOST_CONTACT' THEN 2
            WHEN 'NOT_SUITABLE' THEN 2 WHEN 'INVALID_PHONE' THEN 2 ELSE 1 END), created_at
    INTO rank_b, cb FROM public.leads WHERE id = b;

  IF rank_a IS NULL OR rank_b IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;

  IF rank_a > rank_b OR (rank_a = rank_b AND ca <= cb) THEN
    winner := a; loser := b;
  ELSE
    winner := b; loser := a;
  END IF;

  -- remember the loser's numbers, then free them so UNIQUE(phone) can't trip
  SELECT phone, phone2 INTO l_phone, l_phone2 FROM public.leads WHERE id = loser;
  UPDATE public.leads SET original_email_id = NULL, phone = NULL, phone2 = NULL WHERE id = loser;

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

  -- fill the winner's blanks from the loser; keep the winner's pipeline fields.
  -- phone: winner's primary stays; the loser's numbers land in phone /
  -- phone2 wherever there is room and they differ (sentinels are ignored).
  UPDATE public.leads w SET
    email      = COALESCE(w.email, l.email),
    location   = COALESCE(w.location, l.location),
    experience = COALESCE(w.experience, l.experience),
    age        = COALESCE(w.age, l.age),
    job_title  = COALESCE(w.job_title, l.job_title),
    source     = COALESCE(w.source, l.source),
    notes      = NULLIF(concat_ws(E'\n---\n', NULLIF(w.notes, ''), NULLIF(l.notes, '')), ''),
    tags       = (SELECT array(SELECT DISTINCT unnest(COALESCE(w.tags, '{}') || COALESCE(l.tags, '{}'))))
  FROM public.leads l
  WHERE w.id = winner AND l.id = loser;

  UPDATE public.leads w SET
    phone = COALESCE(
      NULLIF(CASE WHEN w.phone ~ '^(no-phone-|anon-)' THEN NULL ELSE w.phone END, ''),
      CASE WHEN l_phone  ~ '^(no-phone-|anon-)' THEN NULL ELSE l_phone  END,
      w.phone),
    phone2 = COALESCE(w.phone2,
      (SELECT x FROM unnest(ARRAY[l_phone, l_phone2]) AS t(x)
        WHERE x IS NOT NULL AND x !~ '^(no-phone-|anon-)'
          AND x IS DISTINCT FROM COALESCE(
                NULLIF(CASE WHEN w.phone ~ '^(no-phone-|anon-)' THEN NULL ELSE w.phone END, ''),
                CASE WHEN l_phone ~ '^(no-phone-|anon-)' THEN NULL ELSE l_phone END,
                w.phone)
        LIMIT 1))
  WHERE w.id = winner;

  DELETE FROM public.leads WHERE id = loser;

  RETURN winner;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_lead_duplicates(p_lead_id uuid)
RETURNS TABLE (
  id         uuid,
  name       text,
  phone      text,
  status     text,
  sub_status text,
  source     text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH me AS (
    SELECT array(
             SELECT right(regexp_replace(x, '\D', '', 'g'), 9)
             FROM unnest(ARRAY[phone, phone2]) AS t(x)
             WHERE x IS NOT NULL AND x !~ '^(no-phone-|anon-)'
               AND length(regexp_replace(x, '\D', '', 'g')) >= 9
           ) AS mine
    FROM public.leads WHERE id = p_lead_id
  )
  SELECT l.id, l.name, l.phone, l.status, l.sub_status, l.source, l.created_at
  FROM public.leads l, me
  WHERE l.id <> p_lead_id
    AND (
      (l.phone  IS NOT NULL AND l.phone  !~ '^(no-phone-|anon-)' AND length(regexp_replace(l.phone,  '\D','','g')) >= 9
         AND right(regexp_replace(l.phone,  '\D', '', 'g'), 9) = ANY (me.mine))
      OR
      (l.phone2 IS NOT NULL AND l.phone2 !~ '^(no-phone-|anon-)' AND length(regexp_replace(l.phone2, '\D','','g')) >= 9
         AND right(regexp_replace(l.phone2, '\D', '', 'g'), 9) = ANY (me.mine))
    )
  ORDER BY l.created_at DESC;
$$;
