-- ============================================================
-- Migration: שדות חובה בחתימה דיגיטלית + פרטי מועמד
-- Description: כל בקשת חתימה נושאת רשימת שדות חובה שהמועמד
--              חייב למלא לפני שהחתימה נפתחת. הערכים שמולאו
--              נשמרים גם על הבקשה (audit) וגם ב-
--              lead_candidate_details — כדי שהשליחה הבאה
--              לאותו מועמד תגיע ממולאת מראש.
-- ============================================================

ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS required_fields JSONB NOT NULL DEFAULT '["full_name","id_number"]',
  ADD COLUMN IF NOT EXISTS filled_details  JSONB;

ALTER TABLE signature_templates
  ADD COLUMN IF NOT EXISTS required_fields JSONB NOT NULL DEFAULT '["full_name","id_number"]';

CREATE TABLE IF NOT EXISTS lead_candidate_details (
  lead_id    UUID        PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  details    JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lead_candidate_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_lead_candidate_details"
  ON lead_candidate_details FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- שדות חובה לכל תבנית קיימת
UPDATE signature_templates SET required_fields = '["full_name","id_number","phone","address"]'
  WHERE file_path = 'templates/employment_terms.pdf';
UPDATE signature_templates SET required_fields = '["full_name","id_number","birth_date","address","phone","email"]'
  WHERE file_path = 'templates/form_101_2026.pdf';
UPDATE signature_templates SET required_fields = '["full_name","id_number","phone"]'
  WHERE file_path = 'templates/housing_agreement.pdf';
UPDATE signature_templates SET required_fields = '["full_name","id_number","birth_date"]'
  WHERE file_path = 'templates/education_affidavit.pdf';
UPDATE signature_templates SET required_fields = '["full_name","id_number","bank_name","bank_branch","bank_account"]'
  WHERE file_path = 'templates/bank_details.pdf';
