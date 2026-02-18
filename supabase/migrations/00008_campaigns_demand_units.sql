-- ============================================================
-- Migration: Campaigns & Demand Units (Extras Management)
-- Description: Campaign scheduling with client × date matrix
--   for tracking staffing demand and fulfillment.
-- ============================================================

-- ── 1. Campaigns Table ──────────────────────────────────────

CREATE TABLE campaigns (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'Active'
                          CHECK (status IN ('Draft', 'Active', 'Completed')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE campaigns ADD CONSTRAINT chk_campaign_dates
  CHECK (end_date >= start_date);

CREATE INDEX idx_campaigns_status ON campaigns (status);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_campaigns"
  ON campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_campaigns"
  ON campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_campaigns"
  ON campaigns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_campaigns"
  ON campaigns FOR DELETE TO authenticated USING (true);
CREATE POLICY "anon_select_campaigns"
  ON campaigns FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_campaigns"
  ON campaigns FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_campaigns"
  ON campaigns FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── 2. Demand Units Table ───────────────────────────────────

CREATE TABLE demand_units (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id     UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date          DATE        NOT NULL,
  role          TEXT        NOT NULL,
  quantity      INTEGER     NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  filled_count  INTEGER     NOT NULL DEFAULT 0 CHECK (filled_count >= 0),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE demand_units ADD CONSTRAINT chk_filled_lte_quantity
  CHECK (filled_count <= quantity);

-- One demand unit per campaign + client + date + role
CREATE UNIQUE INDEX idx_demand_units_unique
  ON demand_units (campaign_id, client_id, date, role);

CREATE INDEX idx_demand_units_campaign ON demand_units (campaign_id);
CREATE INDEX idx_demand_units_client   ON demand_units (client_id);
CREATE INDEX idx_demand_units_date     ON demand_units (date);

ALTER TABLE demand_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_demand_units"
  ON demand_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_demand_units"
  ON demand_units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_demand_units"
  ON demand_units FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_demand_units"
  ON demand_units FOR DELETE TO authenticated USING (true);
CREATE POLICY "anon_select_demand_units"
  ON demand_units FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_demand_units"
  ON demand_units FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_demand_units"
  ON demand_units FOR UPDATE TO anon USING (true) WITH CHECK (true);
