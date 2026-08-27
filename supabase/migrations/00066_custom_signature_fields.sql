-- ============================================================
-- Migration: שדות מותאמים אישית בחתימה דיגיטלית
-- Description: custom_fields — [{key: "custom_*", label, filler}]
--              שדות שסער מגדיר בעצמו בכלי המיפוי. filler קובע
--              מי ממלא: 'recruiter' (בדיאלוג השליחה) או
--              'candidate' (בטופס החתימה, שדה חובה).
-- ============================================================

ALTER TABLE signature_templates
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '[]';

ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS custom_fields JSONB;
