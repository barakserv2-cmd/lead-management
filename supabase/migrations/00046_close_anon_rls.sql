-- 00046: close the database to the anonymous role.
--
-- Until now almost every table (leads, messages, lead_notes, clients, jobs,
-- storage.objects in lead-documents, …) had USING (true) policies for `anon`.
-- The anon key ships to every browser, so anyone holding it could read and
-- write the whole candidate database without going through the app — and
-- therefore without the audit_log from 00045. That is incompatible with
-- תקנות אבטחת מידע (הרשאות גישה, תיעוד גישה).
--
-- Who still needs what:
--   * signed-in recruiters (browser + cookie client) → role `authenticated` — kept
--   * server code (API routes, crons, server actions)  → service role — bypasses RLS
--   * nothing legitimate runs as `anon` any more (/api/gmail moved to service role)
--
-- Instead of enumerating ~40 policies (several were created out-of-band and
-- don't appear in this migrations folder), drop every policy in `public` and
-- `storage` whose role list includes `anon`, then make sure the tables stay
-- locked (RLS enabled). Policies granted to `public` (= all roles) are
-- rewritten to `authenticated` only.

DO $$
DECLARE
  p RECORD;
BEGIN
  -- 1. policies that mention anon explicitly (alone or together with others)
  FOR p IN
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check, permissive
      FROM pg_policies
     WHERE schemaname IN ('public', 'storage')
       AND 'anon' = ANY (roles)
  LOOP
    IF array_length(p.roles, 1) = 1 THEN
      -- anon-only policy → just drop it
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    ELSE
      -- shared policy (e.g. TO anon, authenticated) → recreate without anon
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s %s %s',
        p.policyname, p.schemaname, p.tablename,
        p.permissive,
        p.cmd,
        (SELECT string_agg(quote_ident(r), ', ') FROM unnest(p.roles) AS r WHERE r <> 'anon'),
        CASE WHEN p.qual       IS NOT NULL THEN 'USING (' || p.qual || ')' ELSE '' END,
        CASE WHEN p.with_check IS NOT NULL THEN 'WITH CHECK (' || p.with_check || ')' ELSE '' END
      );
    END IF;
  END LOOP;

  -- 2. policies granted to `public` (every role incl. anon) → authenticated only
  FOR p IN
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check, permissive
      FROM pg_policies
     WHERE schemaname IN ('public', 'storage')
       AND roles = '{public}'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO authenticated %s %s',
      p.policyname, p.schemaname, p.tablename,
      p.permissive, p.cmd,
      CASE WHEN p.qual       IS NOT NULL THEN 'USING (' || p.qual || ')' ELSE '' END,
      CASE WHEN p.with_check IS NOT NULL THEN 'WITH CHECK (' || p.with_check || ')' ELSE '' END
    );
  END LOOP;

  -- 3. belt and braces: RLS on for every table in public
  FOR p IN
    SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p.schemaname, p.tablename);
  END LOOP;
END $$;

-- 4. Sanity: any table an authenticated user must be able to read that only
-- had an anon policy would now be unreadable. Give every public table a
-- baseline authenticated policy where none exists (same USING(true) the app
-- has always relied on — narrowing per-table is a follow-up).
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables pt
     WHERE schemaname = 'public'
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies pp
          WHERE pp.schemaname = 'public' AND pp.tablename = pt.tablename
            AND 'authenticated' = ANY (pp.roles)
       )
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      'authenticated_all_' || t.tablename, t.tablename
    );
  END LOOP;
END $$;

-- audit_log keeps its own stricter policies from 00045 (select + insert only);
-- the loop above skips it because it already has authenticated policies.
