-- 00040: surface each lead's sub_status on the "לידים של היום" board so the
-- exact state is visible (e.g. status "נוצר קשר" + sub "אין מענה 2").
-- Same dedup logic as 00039, just adds sub_status to the output.

-- Adding a column to RETURNS TABLE changes the return type, which
-- CREATE OR REPLACE can't do — drop first.
DROP FUNCTION IF EXISTS public.get_today_leads_by_recruiter();

CREATE FUNCTION public.get_today_leads_by_recruiter()
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
  handled_at     timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH today AS (
    SELECT
      l.*,
      COALESCE(
        NULLIF(right(regexp_replace(l.phone, '\D', '', 'g'), 9), ''),
        lower(NULLIF(l.email, '')),
        l.id::text
      ) AS dedup_key,
      GREATEST(l.effective_at, COALESCE(l.handled_at, l.effective_at)) AS recency
    FROM public.leads l
    WHERE l.is_candidate IS DISTINCT FROM false
      AND (l.effective_at AT TIME ZONE 'Asia/Jerusalem')::date
        = (now()          AT TIME ZONE 'Asia/Jerusalem')::date
  ),
  deduped AS (
    SELECT DISTINCT ON (dedup_key) *
    FROM today
    ORDER BY dedup_key, recency DESC
  )
  SELECT d.handled_by,
         COALESCE(p.name, d.handled_by)            AS recruiter_name,
         d.id, d.name, d.phone, d.source, d.status, d.sub_status,
         d.effective_at, d.handled_at
  FROM deduped d
  LEFT JOIN public.user_profiles p ON p.email = d.handled_by
  ORDER BY (d.handled_by IS NULL), d.handled_by, d.effective_at DESC;
$$;
