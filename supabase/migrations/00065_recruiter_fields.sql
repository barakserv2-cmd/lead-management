-- ============================================================
-- Migration: שדות רכזת בחתימה דיגיטלית
-- Description: תפקיד / מקום עבודה / שכר שעתי — ערכים שהרכזת
--              ממלאת בזמן השליחה (לא המועמד). מוגדרים על
--              התבנית (recruiter_fields), נאספים בדיאלוג שליחה,
--              נשמרים על הבקשה (recruiter_values), מוצגים
--              למועמד לקריאה בלבד ומוטבעים בטופס.
-- ============================================================

ALTER TABLE signature_templates
  ADD COLUMN IF NOT EXISTS recruiter_fields JSONB NOT NULL DEFAULT '[]';

ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS recruiter_values JSONB;

UPDATE signature_templates
  SET recruiter_fields = '["job_title","workplace","hourly_wage"]'
  WHERE file_path = 'templates/employment_terms.pdf';
