-- 00083: user_profiles — the table every authorization check reads
-- (role = 'אדמין' / 'רכזת', name shown instead of email on boards).
--
-- The table was created by hand in the Supabase dashboard long before the
-- migrations folder existed, so no migration ever described it. This one is
-- idempotent: on prod it is a no-op, on a fresh DB it creates the same shape
-- the code relies on (settings/users/actions.ts, api-auth.ts, today RPCs).
--
-- Access: service role only. The app reads it through the admin client
-- (getSupabaseAdmin) so that a logged-in recruiter cannot list colleagues'
-- roles from the browser — see the comment in leads/page.tsx.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  name       text,
  role       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- handled_by joins on lower-cased email (00053_handlers_lowercase.sql)
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_email_lower_idx
  ON public.user_profiles (lower(email));

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies on purpose: service role bypasses RLS.
