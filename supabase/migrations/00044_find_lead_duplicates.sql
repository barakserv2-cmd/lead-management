-- 00044: find other lead cards that look like the same candidate (same last-9
-- phone digits — robust to +972 / leading 0 / dashes). Powers the "merge
-- duplicates" UI on the lead page.

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
    SELECT right(regexp_replace(phone, '\D', '', 'g'), 9) AS ph9
    FROM public.leads WHERE id = p_lead_id
  )
  SELECT l.id, l.name, l.phone, l.status, l.sub_status, l.source, l.created_at
  FROM public.leads l, me
  WHERE l.id <> p_lead_id
    AND me.ph9 IS NOT NULL AND me.ph9 <> ''
    AND right(regexp_replace(l.phone, '\D', '', 'g'), 9) = me.ph9
  ORDER BY l.created_at DESC;
$$;
