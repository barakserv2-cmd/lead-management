-- ============================================================
-- Migration: Lead documents
-- Description: Metadata table for files (forms, IDs, contracts)
--              attached to a lead. Actual files live in the
--              `lead-documents` Storage bucket; this table maps
--              them to a lead + doc type so we can render slots.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  doc_type     TEXT NOT NULL CHECK (doc_type IN (
    'form_101',
    'id_photo',
    'employment_terms',
    'equipment_commitment',
    'housing_commitment',
    'other'
  )),
  file_path    TEXT NOT NULL,             -- path inside the lead-documents bucket
  file_name    TEXT NOT NULL,             -- original filename for display
  mime_type    TEXT,
  file_size    INTEGER,
  uploaded_by  UUID,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_documents_lead_id  ON lead_documents (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_documents_doc_type ON lead_documents (doc_type);

ALTER TABLE lead_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_lead_documents"
  ON lead_documents FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_lead_documents"
  ON lead_documents FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ── Storage policies for lead-documents bucket ──────────────
-- Any authenticated user may upload / read / delete files.

DROP POLICY IF EXISTS "lead_docs_authenticated_all" ON storage.objects;
CREATE POLICY "lead_docs_authenticated_all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'lead-documents')
  WITH CHECK (bucket_id = 'lead-documents');

DROP POLICY IF EXISTS "lead_docs_anon_all" ON storage.objects;
CREATE POLICY "lead_docs_anon_all"
  ON storage.objects FOR ALL TO anon
  USING (bucket_id = 'lead-documents')
  WITH CHECK (bucket_id = 'lead-documents');
