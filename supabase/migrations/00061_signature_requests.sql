-- ============================================================
-- Migration: signature_requests — חתימה דיגיטלית על מסמכים
-- Description: בקשת חתימה נשלחת למועמד כקישור וואטסאפ עם טוקן
--              חד-פעמי. המועמד חותם בדף ציבורי, השרת מטביע את
--              החתימה על ה-PDF ושומר עותק חתום ב-lead_documents.
--              doc_type/file_name משוכפלים לכאן כי מסמך המקור
--              נמחק אחרי החתימה (העותק החתום מחליף אותו).
-- ============================================================

CREATE TABLE IF NOT EXISTS signature_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  document_id         UUID        REFERENCES lead_documents(id) ON DELETE SET NULL,
  signed_document_id  UUID        REFERENCES lead_documents(id) ON DELETE SET NULL,
  token               TEXT        NOT NULL UNIQUE,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'signed', 'cancelled')),
  doc_type            TEXT        NOT NULL,
  file_name           TEXT        NOT NULL,
  sent_by             TEXT,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  signer_name         TEXT,
  signer_ip           TEXT,
  signer_user_agent   TEXT,
  signed_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_signature_requests_lead_id ON signature_requests (lead_id);
CREATE INDEX IF NOT EXISTS idx_signature_requests_token   ON signature_requests (token);

ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;

-- הדף הציבורי עובר דרך service role בלבד — אין policies ל-anon.
CREATE POLICY "authenticated_all_signature_requests"
  ON signature_requests FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
