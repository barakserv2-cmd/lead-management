-- 00051: per-status lead counts for the /leads filter bar.
-- Aggregates are disabled over PostgREST, so counts come from this RPC.
-- Applies the SAME filters as the list query EXCEPT status, so the numbers
-- shown next to each status in the dropdown are faceted: "if I pick this
-- status (under the current search/folder/tags/dates), how many will I see".
-- '__none__' sentinel = NULL (no source / no handling recruiter), matching
-- the URL params the page already uses.

CREATE OR REPLACE FUNCTION public.get_lead_status_counts(
  p_source   text        DEFAULT NULL,  -- NULL = all sources, '__none__' = source IS NULL
  p_search   text        DEFAULT NULL,
  p_tags     text[]      DEFAULT NULL,
  p_subs     text[]      DEFAULT NULL,
  p_handlers text[]      DEFAULT NULL,  -- may contain '__none__' (= not handled yet)
  p_from     timestamptz DEFAULT NULL,  -- effective_at >= p_from
  p_to       timestamptz DEFAULT NULL,  -- effective_at <  p_to
  p_my_id    text        DEFAULT NULL,  -- assignment-lock: NULL = skip the ownership filter
  p_cutoff   timestamptz DEFAULT NULL   -- stale-claim cutoff (now - 24h), used with p_my_id
)
RETURNS TABLE (status text, cnt bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT l.status, count(*)::bigint AS cnt
  FROM public.leads l
  WHERE l.is_candidate IS DISTINCT FROM false
    AND (p_source IS NULL
         OR (p_source = '__none__' AND l.source IS NULL)
         OR l.source = p_source)
    AND (p_search IS NULL OR p_search = ''
         OR l.name      ILIKE '%' || p_search || '%'
         OR l.phone     ILIKE '%' || p_search || '%'
         OR l.phone2    ILIKE '%' || p_search || '%'
         OR l.job_title ILIKE '%' || p_search || '%')
    AND (p_tags IS NULL OR l.tags && p_tags)
    AND (p_subs IS NULL OR l.sub_status = ANY(p_subs))
    AND (p_handlers IS NULL
         OR l.handled_by = ANY(p_handlers)
         OR ('__none__' = ANY(p_handlers) AND l.handled_by IS NULL))
    AND (p_from IS NULL OR l.effective_at >= p_from)
    AND (p_to   IS NULL OR l.effective_at <  p_to)
    AND (p_my_id IS NULL
         OR l.assigned_to IS NULL
         OR (p_cutoff IS NOT NULL AND l.assigned_at < p_cutoff)
         OR l.assigned_to = p_my_id)
  GROUP BY l.status;
$$;
