-- ============================================================
-- Migration: Create leads table
-- Description: Core table for the Lead Management System.
--              Stores parsed candidate data from AllJobs emails.
-- ============================================================

-- Create a custom enum type for lead status (all 14 statuses from the app)
CREATE TYPE lead_status AS ENUM (
  'חדש',
  'מפוענח',
  'נוצר קשר',
  'מעורב',
  'בסינון',
  'מתאים',
  'הושמה',
  'ללא תגובה',
  'Follow-up 1',
  'Follow-up 2',
  'קר',
  'נדחה',
  'הוסר',
  'ארכיון'
);

-- Create a custom enum type for lead source
CREATE TYPE lead_source AS ENUM (
  'AllJobs',
  'אימייל ישיר',
  'וואטסאפ',
  'טלפון',
  'אחר'
);

-- Create the leads table
CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Candidate info (parsed from email)
  name            TEXT NOT NULL,
  phone           TEXT UNIQUE,
  email           TEXT,
  location        TEXT,
  experience      TEXT,
  age             SMALLINT CHECK (age > 0 AND age < 120),
  job_title       TEXT,

  -- Pipeline
  source          lead_source NOT NULL DEFAULT 'AllJobs',
  status          lead_status NOT NULL DEFAULT 'חדש',
  assigned_to     TEXT,
  notes           TEXT,

  -- Email tracking
  original_email_id   TEXT UNIQUE,
  original_email_body TEXT,

  -- AI metadata
  ai_confidence   REAL CHECK (ai_confidence >= 0 AND ai_confidence <= 1)
);

-- Index on status for dashboard filtering
CREATE INDEX idx_leads_status ON leads (status);

-- Index on source for analytics queries
CREATE INDEX idx_leads_source ON leads (source);

-- Index on created_at for chronological listing
CREATE INDEX idx_leads_created_at ON leads (created_at DESC);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security (required by Supabase)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Authenticated users can read leads"
  ON leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow the anon key to insert (for the API route running without user session)
CREATE POLICY "Anon can insert leads"
  ON leads FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can read leads"
  ON leads FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can update leads"
  ON leads FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
