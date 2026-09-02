-- ============================================================
-- Migration: analytics + finance (שלב 5)
-- channel_costs — הוצאה חודשית פר ערוץ גיוס (מוזן ידנית ע"י סער);
-- finance_settings — דמי השמה ברירת מחדל.
--
-- פרטיות: אין policies ל-authenticated בכוונה — הנתונים הכספיים
-- נגישים רק דרך service role, וה-API אוכף שרק FINANCE_EMAILS
-- (saar@eilatjobs.com) רואה אותם. גם אדמיניות אחרות לא.
-- ============================================================

CREATE TABLE IF NOT EXISTS channel_costs (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  source     TEXT          NOT NULL,
  month      DATE          NOT NULL,
  amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes      TEXT,
  created_by TEXT,
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (source, month)
);
CREATE INDEX IF NOT EXISTS idx_channel_costs_month ON channel_costs (month);

CREATE TABLE IF NOT EXISTS finance_settings (
  id                    INT           PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_placement_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);
INSERT INTO finance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE channel_costs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;
-- אין policies — service role בלבד.
