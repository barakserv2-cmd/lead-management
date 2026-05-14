-- ============================================================
-- Migration: match_candidates_for_job()
-- Description: Phase-1 matching engine. Given an open job,
--              returns the top-N candidates ranked by score.
--              Score is a SQL-only sum (no AI):
--                • title similarity (pg_trgm)         0-40
--                • shared location (ILIKE both ways)  0-30
--                • lead is in an "open" status        0-20
--                • lead has a phone (can reach)       0-10
--              Returned with a `reasons[]` array for the UI.
-- Note: This file mirrors the function that was created via the
--       Management API; recorded here so a fresh clone reproduces
--       the schema correctly.
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_candidates_for_job(
  p_job_id UUID,
  p_limit  INT DEFAULT 20
)
RETURNS TABLE (
  lead_id     UUID,
  name        TEXT,
  phone       TEXT,
  location    TEXT,
  job_title   TEXT,
  experience  TEXT,
  status      TEXT,
  source      TEXT,
  score       INT,
  reasons     TEXT[]
)
LANGUAGE plpgsql STABLE
AS $func$
DECLARE
  v_title TEXT;
  v_loc   TEXT;
BEGIN
  SELECT j.title, j.location INTO v_title, v_loc FROM jobs j WHERE j.id = p_job_id;
  IF v_title IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      l.id,
      l.name        AS lname,
      l.phone       AS lphone,
      l.location    AS lloc,
      l.job_title   AS ltitle,
      l.experience  AS lexp,
      l.status::TEXT AS lstatus,
      l.source::TEXT AS lsource,
      GREATEST(0, ROUND(40 * similarity(COALESCE(l.job_title, ''), v_title))::INT) AS title_score,
      CASE
        WHEN v_loc IS NOT NULL AND l.location IS NOT NULL
             AND (l.location ILIKE '%' || v_loc || '%'
                  OR v_loc    ILIKE '%' || l.location || '%')
        THEN 30 ELSE 0
      END AS loc_score,
      CASE
        WHEN l.status IN (
          'NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS',
          'FIT_FOR_INTERVIEW','INTERVIEW_BOOKED','LOST_CONTACT'
        ) THEN 20 ELSE 0
      END AS status_score,
      CASE WHEN l.phone IS NOT NULL THEN 10 ELSE 0 END AS phone_score
    FROM leads l
    WHERE l.is_candidate <> false
      AND l.status NOT IN ('HIRED','STARTED','REJECTED','NOT_SUITABLE')
  )
  SELECT
    s.id,
    s.lname,
    s.lphone,
    s.lloc,
    s.ltitle,
    s.lexp,
    s.lstatus,
    s.lsource,
    (s.title_score + s.loc_score + s.status_score + s.phone_score) AS score,
    ARRAY_REMOVE(ARRAY[
      CASE
        WHEN s.title_score >= 25 THEN 'תפקיד תואם'
        WHEN s.title_score >  0  THEN 'תפקיד דומה'
      END,
      CASE WHEN s.loc_score    > 0 THEN 'אותו מיקום' END,
      CASE WHEN s.status_score > 0 THEN 'זמין'        END,
      CASE WHEN s.phone_score  > 0 THEN 'יש טלפון'    END
    ], NULL) AS reasons
  FROM scored s
  WHERE (s.title_score + s.loc_score + s.status_score + s.phone_score) >= 30
  ORDER BY (s.title_score + s.loc_score + s.status_score + s.phone_score) DESC,
           s.lstatus
  LIMIT p_limit;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.match_candidates_for_job(UUID, INT)
  TO anon, authenticated;
