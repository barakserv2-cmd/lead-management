-- 00088: RLS — "authenticated" is NOT "recruiter".
--
-- Security audit 2026-09-09: Supabase email signups are enabled on this
-- project, and 55 policies across 38 tables granted the `authenticated` role
-- blanket access (USING (true) / WITH CHECK (true) / auth.role() checks).
-- A confirmed user with no recruiter profile could read 3,869 leads (names +
-- phones), 4,193 messages, the audit log and user_profiles straight through
-- the Supabase REST API with the public anon key — no app involved.
--
-- Fix: a session counts only if its email has a row in user_profiles (the
-- invite/admin-created recruiters). Every wide-open authenticated policy is
-- rewritten in place to require is_recruiter(); names, commands and roles are
-- preserved, and any policy that already had a real predicate keeps it ANDed.
-- Service-role (API routes, crons, bridge) bypasses RLS and is unaffected.

CREATE OR REPLACE FUNCTION public.is_recruiter()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_recruiter() FROM public;
GRANT EXECUTE ON FUNCTION public.is_recruiter() TO authenticated, anon, service_role;

DO $$
DECLARE
  p record;
  new_using text;
  new_check text;
  wide_using boolean;
  wide_check boolean;
  pol_cmd text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd AS pcmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text LIKE '%authenticated%'
  LOOP
    wide_using := (p.qual IS NULL) OR (p.qual = 'true') OR (p.qual ILIKE '%auth.role()%');
    wide_check := (p.with_check IS NULL) OR (p.with_check = 'true') OR (p.with_check ILIKE '%auth.role()%');

    -- nothing to tighten: both sides already carry a real predicate
    IF NOT wide_using AND NOT wide_check THEN
      CONTINUE;
    END IF;

    pol_cmd := p.pcmd;  -- ALL | SELECT | INSERT | UPDATE | DELETE

    -- USING applies to SELECT/UPDATE/DELETE/ALL; WITH CHECK to INSERT/UPDATE/ALL
    new_using := CASE
      WHEN pol_cmd = 'INSERT' THEN NULL
      WHEN wide_using THEN 'public.is_recruiter()'
      ELSE 'public.is_recruiter() AND (' || p.qual || ')'
    END;
    new_check := CASE
      WHEN pol_cmd IN ('SELECT', 'DELETE') THEN NULL
      WHEN wide_check THEN 'public.is_recruiter()'
      ELSE 'public.is_recruiter() AND (' || p.with_check || ')'
    END;

    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s %s %s',
      p.policyname, p.schemaname, p.tablename,
      p.permissive,
      pol_cmd,
      array_to_string(p.roles, ', '),
      CASE WHEN new_using IS NOT NULL THEN 'USING (' || new_using || ')' ELSE '' END,
      CASE WHEN new_check IS NOT NULL THEN 'WITH CHECK (' || new_check || ')' ELSE '' END
    );
    RAISE NOTICE 'tightened policy % on %', p.policyname, p.tablename;
  END LOOP;
END $$;
