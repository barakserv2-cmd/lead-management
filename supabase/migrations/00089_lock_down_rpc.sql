-- 00089: destructive/PII database functions must not be callable from a browser.
--
-- Security audit 2026-09-09 (verified live against prod): Supabase grants
-- EXECUTE on every function in `public` to PUBLIC + anon + authenticated, so
-- anyone holding the public anon key — which ships in every page load — could
-- call them straight through PostgREST at /rest/v1/rpc/<fn>, bypassing the
-- application's requireAdmin() guard entirely:
--
--   purge_audit_log(0)                → deletes the ENTIRE audit_log (4,235 rows)
--   anonymize_lead(<id>, '<actor>')   → irreversibly strips a candidate's PII,
--                                       with a caller-forged actor in the log
--   merge_leads(a, b)                 → deletes the losing lead card
--   retention_candidates(...)         → lists candidates due for erasure
--   match_candidates_for_job(...)     → returns candidate PII
--
-- anonymize_lead and purge_audit_log are SECURITY DEFINER, so they run as the
-- owner and RLS (including migration 00088) cannot stop them.
--
-- Fix: these are server-only. The service role (API routes, crons) keeps
-- EXECUTE; PUBLIC/anon/authenticated lose it. Untouched on purpose: the four
-- RPCs the dashboard itself calls with the user session
-- (get_distinct_lead_tags, get_lead_status_counts, get_lead_handlers,
-- get_today_leads_by_recruiter), is_recruiter() (RLS needs it), trigger
-- functions, and pg_trgm extension internals.

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'anonymize_lead',
        'purge_audit_log',
        'retention_candidates',
        'merge_leads',
        'find_lead_duplicates',
        'match_candidates_for_job',
        'book_interview_slot',
        'increment_publication_responses',
        'increment_variant_use',
        'transition_assignment_status',
        'validate_assignment'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    RAISE NOTICE 'locked %', f.sig;
  END LOOP;
END $$;

-- Future functions are closed to PUBLIC by default; each one must be granted
-- explicitly to the role that needs it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
