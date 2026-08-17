-- 00037: attribute lead handling to a recruiter + a daily board.
-- assigned_to was never populated and user_profiles.id != auth.users.id, so we
-- track the handler by EMAIL (which change-status already knows and which joins
-- cleanly to user_profiles.email). handled_by is stamped when a recruiter moves
-- a lead's status (see changeLeadStatus).

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS handled_by text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS handled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_effective_handled
  ON public.leads (effective_at, handled_by);

-- Today's leads (Asia/Jerusalem calendar day), each with the recruiter who
-- handled it. handled_by NULL => not handled yet. Grouped/rendered by the page.
CREATE OR REPLACE FUNCTION public.get_today_leads_by_recruiter()
RETURNS TABLE (
  handled_by     text,
  recruiter_name text,
  lead_id        uuid,
  lead_name      text,
  phone          text,
  source         text,
  status         text,
  effective_at   timestamptz,
  handled_at     timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT l.handled_by,
         COALESCE(p.name, l.handled_by)            AS recruiter_name,
         l.id, l.name, l.phone, l.source, l.status,
         l.effective_at, l.handled_at
  FROM public.leads l
  LEFT JOIN public.user_profiles p ON p.email = l.handled_by
  WHERE l.is_candidate IS DISTINCT FROM false
    AND (l.effective_at AT TIME ZONE 'Asia/Jerusalem')::date
      = (now()          AT TIME ZONE 'Asia/Jerusalem')::date
  ORDER BY (l.handled_by IS NULL), l.handled_by, l.effective_at DESC;
$$;
