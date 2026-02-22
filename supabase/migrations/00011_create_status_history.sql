CREATE TABLE lead_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_status lead_status,
  to_status lead_status NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_status_history_lead ON lead_status_history(lead_id, changed_at DESC);
