-- 00053: recruiter attribution is keyed by email. Auth emails are always
-- lowercase, but user_profiles.email was typed by hand ("Hoshen@…"), so the
-- recruiter filter / name lookup / today-board join silently missed. Normalize
-- stored emails and expose the actual set of handlers (with counts) so the
-- filter lists everyone who really handled leads — even without a profile.

UPDATE public.user_profiles SET email = lower(email) WHERE email <> lower(email);
UPDATE public.leads SET handled_by = lower(handled_by) WHERE handled_by <> lower(handled_by);

CREATE OR REPLACE FUNCTION public.get_lead_handlers()
RETURNS TABLE (handled_by text, cnt bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT lower(l.handled_by) AS handled_by, count(*)::bigint AS cnt
  FROM public.leads l
  WHERE l.handled_by IS NOT NULL
    AND l.is_candidate IS DISTINCT FROM false
  GROUP BY lower(l.handled_by)
  ORDER BY cnt DESC;
$$;
