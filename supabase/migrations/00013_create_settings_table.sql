CREATE TABLE settings (
  id                   INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  gmail_access_token   TEXT,
  gmail_refresh_token  TEXT,
  gmail_token_expiry   TIMESTAMPTZ,
  gmail_email          TEXT,
  gmail_connected_at   TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (id) VALUES (1);

-- Allow read/update for anon and authenticated
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read settings" ON settings
  FOR SELECT USING (true);

CREATE POLICY "Allow update settings" ON settings
  FOR UPDATE USING (true);
