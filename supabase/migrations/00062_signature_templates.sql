-- ============================================================
-- Migration: signature_templates — ספריית מסמכים קבועים לחתימה
-- Description: תבניות PDF (תנאי העסקה, טופס 101, התחייבויות...)
--              שנשלחות למועמדים בקליק אחד מכרטיס הליד. הקבצים
--              יושבים ב-bucket lead-documents תחת templates/.
--              שליחה מעתיקה את הקובץ לתיקיית הליד ויוצרת
--              lead_document + signature_request רגילים.
-- ============================================================

CREATE TABLE IF NOT EXISTS signature_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,             -- שם תצוגה בעברית
  doc_type    TEXT        NOT NULL,             -- לאיזה סלוט מסמכים זה נכנס
  file_path   TEXT        NOT NULL,             -- templates/<slug>.pdf בתוך lead-documents
  file_name   TEXT        NOT NULL,
  mime_type   TEXT        NOT NULL DEFAULT 'application/pdf',
  file_size   INTEGER,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE signature_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_signature_templates"
  ON signature_templates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
