-- ============================================================
-- Migration: Create clients table
-- Description: Standalone clients module, separate from leads.
-- ============================================================

CREATE TABLE clients (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  contact_person TEXT,
  phone          TEXT        NOT NULL UNIQUE,
  email          TEXT,
  type           TEXT        NOT NULL DEFAULT 'Other'
                             CHECK (type IN ('Hotel', 'Restaurant', 'Construction', 'Other')),
  status         TEXT        NOT NULL DEFAULT 'Active'
                             CHECK (status IN ('Active', 'Frozen', 'Debt')),
  city           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_status ON clients (status);
CREATE INDEX idx_clients_phone  ON clients (phone);

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_clients"
  ON clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_clients"
  ON clients FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_clients"
  ON clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete_clients"
  ON clients FOR DELETE TO authenticated USING (true);

CREATE POLICY "anon_select_clients"
  ON clients FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_clients"
  ON clients FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_clients"
  ON clients FOR UPDATE TO anon USING (true) WITH CHECK (true);
