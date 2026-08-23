-- 00053: per-recruiter WhatsApp accounts.
-- Each recruiter can link their own Green API instance (= their personal
-- WhatsApp number). Manual / bulk sends from the CRM go out from the signed-in
-- recruiter's number; inbound messages on that instance are matched back to the
-- recruiter. Keyed by EMAIL like leads.handled_by (user_profiles.id != auth id).
-- Tokens live here and are readable ONLY via the service role (RLS on, no
-- policies for anon/authenticated).

CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      text NOT NULL UNIQUE,
  instance_id     text NOT NULL UNIQUE,
  api_token       text NOT NULL,
  phone           text,                 -- wid of the linked WhatsApp number
  label           text,                 -- display name shown in the chat UI
  is_active       boolean NOT NULL DEFAULT true,
  last_state      text,                 -- last Green API stateInstance
  last_checked_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
-- intentionally no policies: service role only.

-- Attribute outgoing messages to the recruiter + instance that sent them.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sent_by text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS via_instance text;
