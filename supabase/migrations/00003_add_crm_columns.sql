-- ============================================================
-- Migration: Add CRM workflow columns to leads table
-- Description: Adds financial_status, client_type,
--              active_jobs_count, active_employees_count,
--              recruitment_status, and preferences columns.
-- ============================================================

-- 1. financial_status enum
CREATE TYPE financial_status AS ENUM (
  'balanced',
  'delayed_payment',
  'debt',
  'bad_debt'
);

-- 2. client_type enum
CREATE TYPE client_type AS ENUM (
  'hotel',
  'restaurant',
  'construction',
  'office',
  'other'
);

-- 3. recruitment_status enum
CREATE TYPE recruitment_status AS ENUM (
  'active',
  'frozen',
  'on_hold'
);

-- Add columns to leads table
ALTER TABLE leads
  ADD COLUMN financial_status      financial_status NOT NULL DEFAULT 'balanced',
  ADD COLUMN client_type           client_type,
  ADD COLUMN active_jobs_count     INTEGER NOT NULL DEFAULT 0 CHECK (active_jobs_count >= 0),
  ADD COLUMN active_employees_count INTEGER NOT NULL DEFAULT 0 CHECK (active_employees_count >= 0),
  ADD COLUMN recruitment_status    recruitment_status NOT NULL DEFAULT 'active',
  ADD COLUMN preferences           JSONB DEFAULT '{}';

-- Index on financial_status for filtering delinquent clients
CREATE INDEX idx_leads_financial_status ON leads (financial_status);

-- Index on recruitment_status for active/frozen filtering
CREATE INDEX idx_leads_recruitment_status ON leads (recruitment_status);

-- Index on client_type for segmentation queries
CREATE INDEX idx_leads_client_type ON leads (client_type);
