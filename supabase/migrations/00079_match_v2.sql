-- ============================================================
-- Migration: matching engine v2 (שלב 7)
-- אותה חתימה ואותו פלט — המסכים והעוזר לא משתנים. מה שהשתנה:
-- המנוע קורא עכשיו את כל מה שכבר שמור על המועמד:
--   • תפקיד דומה (trigram)                    0-40
--   • ציוני שיחת הבוט (ממוצע 4 הממדים)        0-20
--   • מיקום משותף                              0-15  (ירד מ-30 — יש מגורים)
--   • סטטוס פתוח                               0-15
--   • זמינות שחולצה מהשיחה                     0-10 (מיידי) / 4 (צוינה)
--   • ציפיות שכר מול שכר המשרה                 0-8  (רק באותו סולם: שעתי/חודשי)
--   • ניסיון מתועד                              0-5
--   • טלפון                                     0-5
--   • דומה למי שכבר הושם אצל אותו מעסיק        0-12
-- הציון נחתך ל-100. סף כניסה נשאר 30.
-- p_include_all=true — למבחן-העבר בלבד (כולל מועסקים/סגורים).
-- ============================================================

DROP FUNCTION IF EXISTS public.match_candidates_for_job(UUID, INT);

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
  WITH hired_titles AS (
    -- מה שכבר עבד אצל המעסיק הזה: תפקידי מועמדים שהושמו במשרות שלו
    SELECT DISTINCT h.job_title AS htitle, h.id AS hid
      FROM leads h
      JOIN jobs hj ON hj.id = h.hired_job_id
     WHERE hj.client_id = v_client_id
       AND h.job_title IS NOT NULL
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
      GREATEST(0, ROUND(40 * similarity(COALESCE(l.job_title, ''), v_title))::INT) AS title_score,
      CASE
        WHEN v_loc IS NOT NULL AND l.location IS NOT NULL
             AND (l.location ILIKE '%' || v_loc || '%'
                  OR v_loc    ILIKE '%' || l.location || '%')
        THEN 15 ELSE 0
      END AS loc_score,
      CASE
        WHEN l.status IN (
          'NEW_LEAD','CONTACTED','SCREENING_IN_PROGRESS',
          'FIT_FOR_INTERVIEW','INTERVIEW_BOOKED','LOST_CONTACT'
        ) THEN 15 ELSE 0
      END AS status_score,
      CASE WHEN l.phone IS NOT NULL THEN 5 ELSE 0 END AS phone_score,
      -- ציוני הבוט: ממוצע 4 הממדים, מנורמל ל-0-20
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
      -- שכר: משווים רק כשהמספרים באותו סולם (שעתי <200 או חודשי >=1000)
      CASE
        WHEN v_job_pay IS NOT NULL THEN
          CASE
            WHEN lead_pay.p IS NOT NULL
                 AND ((lead_pay.p < 200 AND v_job_pay < 200)
                   OR (lead_pay.p >= 1000 AND v_job_pay >= 1000))
                 AND lead_pay.p <= ROUND(v_job_pay * 1.1)
            THEN 8 ELSE 0
          END
        ELSE 0
      END AS pay_score,
      CASE WHEN LENGTH(TRIM(COALESCE(l.experience, ''))) > 3 THEN 5 ELSE 0 END AS exp_score,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM hired_titles ht
           WHERE ht.hid <> l.id
             AND similarity(COALESCE(l.job_title, ''), ht.htitle) > 0.35
        ) THEN 12 ELSE 0
      END AS hired_sim_score
    FROM leads l
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
      CASE WHEN s.phone_score > 0     THEN 'יש טלפון' END
    ], NULL) AS reasons
  FROM scored s
  WHERE (s.title_score + s.loc_score + s.status_score + s.phone_score
       + s.bot_score + s.avail_score + s.pay_score + s.exp_score
       + s.hired_sim_score) >= 30
  ORDER BY 9 DESC, s.lstatus
  LIMIT p_limit;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.match_candidates_for_job(UUID, INT, BOOLEAN)
  TO anon, authenticated;
