-- 00099: sign-ups are closed — only people on the users screen get an account.
--
-- Review committee 29/09: email sign-ups are enabled on the project (see
-- 00088), so anyone with the public anon key could create a Supabase account.
-- The app no longer trusts such an account (proxy + getAuthedUser require a
-- user_profiles row, #12), but the account itself should not exist.
--
-- The dashboard switch (Authentication → Sign In / Providers → "Allow new
-- users to sign up") is the usual way to close this; this trigger does the
-- same thing in the database, so it holds even if the switch is flipped back:
-- a new auth.users row is accepted only when its email already has a row in
-- user_profiles. The admin flow is unaffected — the users screen creates the
-- profile first, then /api/users/set-password creates the login.
-- Consequence: "Invite user" / "Add user" in Supabase Studio also needs the
-- profile to exist first.
--
-- Undo: DROP TRIGGER block_unlisted_signups ON auth.users;

CREATE OR REPLACE FUNCTION public.block_unlisted_signups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE lower(p.email) = lower(NEW.email)
  ) THEN
    RAISE EXCEPTION 'sign-ups are closed: this email is not on the users screen'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.block_unlisted_signups() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS block_unlisted_signups ON auth.users;
CREATE TRIGGER block_unlisted_signups
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.block_unlisted_signups();
