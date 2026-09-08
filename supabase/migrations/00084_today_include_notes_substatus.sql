-- 00084: the "לידים של היום" board only surfaced a lead when its status
-- changed (effective_at / handled_at fell on the day). But a recruiter also
-- "touches" a lead by changing its SUB-status (אין מענה 1→2, מעקב) or by
-- writing a NOTE — and neither moved the lead onto the board, so that daily
-- activity was invisible. Broaden the day filter so a lead appears when, on
-- the target Israel day, ANY of these happened:
--   • status change      (effective_at / handled_at) — existing
--   • sub-status change   (sub_status_at)             — new
--   • a recruiter note    (lead_events by a human)    — new
--
-- Signature is unchanged so the deployed page keeps working.

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
  -- latest human-written note per lead on the target day. Gubget's automated
  -- notes are excluded so its high-volume note stream does not flood the board.
  notes AS (
    SELECT e.lead_id, max(e.created_at) AS note_at
    FROM public.lead_events e, target t
    WHERE (e.created_at AT TIME ZONE 'Asia/Jerusalem')::date = t.d
      AND e.created_by LIKE '%@%'
      AND e.created_by <> 'gubget@eilatjobs.com'
    GROUP BY e.lead_id
  ),
  day AS (
    SELECT
      l.*,
      n.note_at,
      COALESCE(
        NULLIF(right(regexp_replace(l.phone, '\D', '', 'g'), 9), ''),
        lower(NULLIF(l.email, '')),
        l.id::text
      ) AS dedup_key,
      GREATEST(
        l.effective_at,
        COALESCE(l.handled_at,     l.effective_at),
        COALESCE(l.sub_status_at,  l.effective_at),
        COALESCE(n.note_at,        l.effective_at)
      ) AS recency
    FROM public.leads l
    CROSS JOIN target t
    LEFT JOIN notes n ON n.lead_id = l.id
    WHERE l.is_candidate IS DISTINCT FROM false
      AND (
        (l.effective_at   AT TIME ZONE 'Asia/Jerusalem')::date = t.d
        OR (l.handled_at    AT TIME ZONE 'Asia/Jerusalem')::date = t.d
        OR (l.sub_status_at AT TIME ZONE 'Asia/Jerusalem')::date = t.d
        OR n.note_at IS NOT NULL
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
  ORDER BY (d.handled_by IS NULL),
           d.handled_by,
           d.recency DESC;
$$;
