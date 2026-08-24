-- 00060: the board could only ever show today. Take an optional date so
-- recruiters can look back at yesterday (or any day).
--
-- The parameter has a DEFAULT, so a call with no arguments still resolves and
-- the currently deployed build keeps working while the new one ships. The old
-- zero-argument function must go first — otherwise an argument-less call is
-- ambiguous between the two.

DROP FUNCTION IF EXISTS public.get_today_leads_by_recruiter();

CREATE OR REPLACE FUNCTION public.get_today_leads_by_recruiter(p_date date DEFAULT NULL)
RETURNS TABLE (
  handled_by     text,
  recruiter_name text,
  lead_id        uuid,
  lead_name      text,
  phone          text,
  source         text,
  status         text,
  sub_status     text,
  effective_at   timestamptz,
  handled_at     timestamptz,
  job_title      text,
  location       text
)
LANGUAGE sql
STABLE
AS $$
  WITH target AS (
    SELECT COALESCE(p_date, (now() AT TIME ZONE 'Asia/Jerusalem')::date) AS d
  ),
  day AS (
    SELECT
      l.*,
      COALESCE(
        NULLIF(right(regexp_replace(l.phone, '\D', '', 'g'), 9), ''),
        lower(NULLIF(l.email, '')),
        l.id::text
      ) AS dedup_key,
      GREATEST(l.effective_at, COALESCE(l.handled_at, l.effective_at)) AS recency
    FROM public.leads l, target t
    WHERE l.is_candidate IS DISTINCT FROM false
      AND (
        (l.effective_at AT TIME ZONE 'Asia/Jerusalem')::date = t.d
        OR (l.handled_at AT TIME ZONE 'Asia/Jerusalem')::date = t.d
      )
  ),
  deduped AS (
    SELECT DISTINCT ON (dedup_key) *
    FROM day
    ORDER BY dedup_key, recency DESC
  )
  SELECT d.handled_by,
         COALESCE(p.name, d.handled_by)            AS recruiter_name,
         d.id, d.name, d.phone, d.source, d.status, d.sub_status,
         d.effective_at, d.handled_at,
         d.job_title, d.location
  FROM deduped d
  LEFT JOIN public.user_profiles p ON p.email = d.handled_by
  -- most recent activity first within each recruiter
  ORDER BY (d.handled_by IS NULL),
           d.handled_by,
           GREATEST(d.effective_at, COALESCE(d.handled_at, d.effective_at)) DESC;
$$;
