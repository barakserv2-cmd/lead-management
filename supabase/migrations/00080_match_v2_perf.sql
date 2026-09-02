-- ============================================================
-- Migration: matching v2 perf fix — בונוס הדמיון מחושב פר תפקיד
-- ייחודי (מאות) במקום פר מועמד (אלפים): 18ש' → רגעי.
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_candidates_for_job(
  p_job_id      UUID,
  p_limit       INT     DEFAULT 20,
  p_include_all BOOLEAN DEFAULT FALSE
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
  v_title     TEXT;
  v_loc       TEXT;
  v_client_id UUID;
  v_job_pay   INT;
BEGIN
  SELECT j.title, j.location, j.client_id,
         (regexp_match(COALESCE(j.pay_rate, ''), '\d{2,6}'))[1]::INT
    INTO v_title, v_loc, v_client_id, v_job_pay
    FROM jobs j WHERE j.id = p_job_id;
  IF v_title IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- MATERIALIZED: בלי זה הפלאנר משטיח את ה-CTE ומחשב את הדמיון
  -- מחדש פר שורת ליד — 15 שניות במקום רבע שנייה.
  WITH hired_titles AS MATERIALIZED (
    SELECT DISTINCT h.job_title AS htitle
      FROM leads h
      JOIN jobs hj ON hj.id = h.hired_job_id
     WHERE hj.client_id = v_client_id
       AND h.job_title IS NOT NULL
  ),
  -- דמיון פר תפקיד ייחודי — מאות שורות במקום אלפים
  title_scores AS MATERIALIZED (
    SELECT dt.t,
           GREATEST(0, ROUND(40 * similarity(dt.t, v_title))::INT) AS tscore,
           CASE WHEN EXISTS (
             SELECT 1 FROM hired_titles ht WHERE similarity(dt.t, ht.htitle) > 0.35
           ) THEN 12 ELSE 0 END AS hbonus
      FROM (SELECT DISTINCT COALESCE(l2.job_title, '') AS t FROM leads l2) dt
  ),
  scored AS (
    SELECT
      l.id,
      l.name        AS lname,
      l.phone       AS lphone,
      l.location    AS lloc,
      l.job_title   AS ltitle,
      l.experience  AS lexp,
      l.status::TEXT AS lstatus,
      l.source::TEXT AS lsource,
      ts.tscore AS title_score,
      ts.hbonus AS hired_sim_score,
      CASE
        WHEN v_loc IS NOT NULL AND l.location IS NOT NULL
             AND (l.location ILIKE '%' || v_loc || '%'
                  OR v_loc    ILIKE '%' || l.location || '%')
        THEN 15 ELSE 0
      END AS loc_score,
      CASE
        -- במצב מבחן-עבר: מנטרלים את רכיב הסטטוס — ליד שהושם הוא
        -- HIRED בהגדרה, וזה לא צריך להוריד לו נקודות במבחן.
        WHEN p_include_all THEN 15
        WHEN l.status IN (
          'NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS',
          'FIT_FOR_INTERVIEW','INTERVIEW_BOOKED','LOST_CONTACT'
        ) THEN 15 ELSE 0
      END AS status_score,
      CASE WHEN l.phone IS NOT NULL THEN 5 ELSE 0 END AS phone_score,
      CASE
        WHEN l.screening_motivation_score IS NOT NULL
        THEN ROUND(20.0 * (
               COALESCE(l.screening_motivation_score, 0)
             + COALESCE(l.screening_fit_score, 0)
             + COALESCE(l.screening_availability_score, 0)
             + COALESCE(l.screening_experience_score, 0)
           ) / 400.0)::INT
        ELSE 0
      END AS bot_score,
      CASE
        WHEN l.extracted_availability ~* '(מייד|מיידי|מחר|עכשיו|היום|זמין)' THEN 10
        WHEN COALESCE(l.extracted_availability, '') <> '' THEN 4
        ELSE 0
      END AS avail_score,
      CASE
        WHEN v_job_pay IS NOT NULL AND l.extracted_salary_expectation IS NOT NULL THEN
          CASE
            WHEN lead_pay.p IS NOT NULL
                 AND ((lead_pay.p < 200 AND v_job_pay < 200)
                   OR (lead_pay.p >= 1000 AND v_job_pay >= 1000))
                 AND lead_pay.p <= ROUND(v_job_pay * 1.1)
            THEN 8 ELSE 0
          END
        ELSE 0
      END AS pay_score,
      CASE WHEN LENGTH(TRIM(COALESCE(l.experience, ''))) > 3 THEN 5 ELSE 0 END AS exp_score
    FROM leads l
    JOIN title_scores ts ON ts.t = COALESCE(l.job_title, '')
    LEFT JOIN LATERAL (
      SELECT (regexp_match(COALESCE(l.extracted_salary_expectation, ''), '\d{2,6}'))[1]::INT AS p
    ) lead_pay ON TRUE
    WHERE l.is_candidate <> false
      AND (p_include_all OR l.status NOT IN ('HIRED','STARTED','REJECTED','NOT_SUITABLE'))
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
    LEAST(100, s.title_score + s.loc_score + s.status_score + s.phone_score
             + s.bot_score + s.avail_score + s.pay_score + s.exp_score
             + s.hired_sim_score) AS score,
    ARRAY_REMOVE(ARRAY[
      CASE
        WHEN s.title_score >= 25 THEN 'תפקיד תואם'
        WHEN s.title_score >  0  THEN 'תפקיד דומה'
      END,
      CASE WHEN s.hired_sim_score > 0 THEN 'דומה למי שהושם אצל המעסיק' END,
      CASE WHEN s.bot_score >= 14     THEN 'הבוט התרשם מאוד'
           WHEN s.bot_score >= 8      THEN 'עבר סינון בוט' END,
      CASE WHEN s.avail_score = 10    THEN 'זמין מיידי'
           WHEN s.avail_score > 0     THEN 'ציין זמינות' END,
      CASE WHEN s.pay_score > 0       THEN 'שכר תואם' END,
      CASE WHEN s.exp_score > 0       THEN 'יש ניסיון' END,
      CASE WHEN s.loc_score > 0       THEN 'אותו מיקום' END,
      CASE WHEN s.status_score > 0    THEN 'זמין בתהליך' END,
      CASE WHEN s.phone_score  > 0    THEN 'יש טלפון' END
    ], NULL) AS reasons
  FROM scored s
  WHERE (s.title_score + s.loc_score + s.status_score + s.phone_score
       + s.bot_score + s.avail_score + s.pay_score + s.exp_score
       + s.hired_sim_score) >= 30
  ORDER BY 9 DESC, s.lstatus
  LIMIT p_limit;
END;
$func$;
