-- ============================================================
-- Migration: Fix leads RLS policies
-- Description: Drop all existing policies on leads table and
--              recreate fully permissive ones for authenticated
--              and anon roles. Also handles user_id column if
--              it was added after initial migration.
-- ============================================================

-- Drop ALL existing policies on leads (names may vary from dashboard edits)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'leads'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON leads', pol.policyname);
  END LOOP;
END;
$$;

-- If a user_id column exists, backfill NULLs with the first auth user
-- (the admin who set up the system)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'user_id'
  ) THEN
    EXECUTE format(
      'UPDATE leads SET user_id = (SELECT id FROM auth.users LIMIT 1) WHERE user_id IS NULL'
    );
    RAISE NOTICE 'Backfilled NULL user_id values';
  ELSE
    RAISE NOTICE 'No user_id column found — skipping backfill';
  END IF;
END;
$$;

-- Ensure RLS is enabled
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Recreate fully permissive policies for authenticated users
CREATE POLICY "authenticated_select_leads"
  ON leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_leads"
  ON leads FOR DELETE
  TO authenticated
  USING (true);

-- Recreate permissive policies for anon role (API routes)
CREATE POLICY "anon_select_leads"
  ON leads FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_insert_leads"
  ON leads FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_leads"
  ON leads FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
