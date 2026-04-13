ALTER TABLE leads ADD COLUMN IF NOT EXISTS arrival_date DATE;
CREATE INDEX IF NOT EXISTS idx_leads_arrival_date ON leads(arrival_date) WHERE arrival_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_hired_client ON leads(hired_client) WHERE hired_client IS NOT NULL;
