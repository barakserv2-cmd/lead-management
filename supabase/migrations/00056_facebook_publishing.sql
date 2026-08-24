-- 00056: organic Facebook-groups publishing module (/publishing).
--
-- Facebook removed the Groups publishing API (publish_to_groups, deprecated
-- April 2024), so nothing here posts to Facebook by itself. Each recruiter is a
-- member of her own set of job groups and posts from her own logged-in Facebook
-- profile; this module is the cockpit around that manual act:
--   fb_role_templates - the 7 roles Barak recruits for over and over
--   fb_groups         - per-recruiter group inventory + cooldown & rules
--   fb_posts          - a piece of copy (from a role template and/or a job)
--   fb_variants       - rewrites of the same post, so identical text never
--                       lands in two groups (Facebook flags duplicates as spam)
--   fb_publications   - one row per (post, group): the queue, what was pasted,
--                       when it went live, and what it brought back
--
-- Attribution: every publication carries a unique tracking_code that goes into
-- the CTA link (wa.me prefilled text). A candidate who writes in quotes the
-- code, so a lead traces back to the exact group - never to a generic
-- "facebook" bucket.

-- == The 7 recurring roles ==================================
-- A template is the reusable skeleton; every publication still gets its own
-- rewrite so no two groups see identical text.
CREATE TABLE IF NOT EXISTS public.fb_role_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key     text NOT NULL UNIQUE,
  role_label   text NOT NULL,
  emoji        text,
  headline     text,
  body         text,
  requirements text[] NOT NULL DEFAULT '{}',
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.fb_role_templates (role_key, role_label, emoji, headline, requirements, sort_order)
VALUES
  ('waiter',      'מלצר/ית',      '🍽️',  'דרושים מלצרים/ות לאילת - התחלה מיידית', ARRAY['ניסיון יתרון','שירותיות','זמינות למשמרות'], 1),
  ('cook',        'טבח/ית',       '🍳',  'דרושים טבחים/ות לאילת - שכר גבוה',      ARRAY['ניסיון במטבח','עבודה בצוות','זמינות מיידית'], 2),
  ('security',    'קב"ט / מאבטח', '🛡️',  'דרושים מאבטחים/קב"טים לאילת',           ARRAY['רישיון/הכשרה יתרון','אחריות','משמרות'], 3),
  ('front_desk',  'פקיד/ת קבלה',  '🛎️',  'דרושים פקידי/ות קבלה למלונות באילת',    ARRAY['אנגלית ברמה טובה','ייצוגיות','מערכות מלונאיות יתרון'], 4),
  ('checker',     'צ''קר/ית',     '🧾',  'דרושים צ''קרים/יות למלונות באילת',      ARRAY['דיוק','סדר וארגון','ניסיון במשק בית יתרון'], 5),
  ('salesperson', 'מוכרן/ית',     '🛍️',  'דרושים מוכרנים/יות לחנויות באילת',      ARRAY['שירותיות','ניסיון במכירות יתרון','זמינות'], 6),
  ('cashier',     'קופאי/ת',      '💳',  'דרושים קופאים/יות לאילת',               ARRAY['אמינות','שירותיות','זמינות למשמרות'], 7)
ON CONFLICT (role_key) DO NOTHING;

-- == Group inventory, per recruiter =========================
-- A group belongs to the recruiter who is actually a MEMBER of it - she is the
-- only one who can post there. Keyed by email like leads.handled_by /
-- whatsapp_accounts.user_email (00053). Two recruiters may both own the same
-- URL if they are both members.
CREATE TABLE IF NOT EXISTS public.fb_groups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email       text NOT NULL,
  name              text NOT NULL,
  url               text NOT NULL,
  members           integer,                      -- rough size, manual
  category          text,                         -- "דרושים אילת", "סטודנטים", ...
  cooldown_hours    integer NOT NULL DEFAULT 24,  -- min gap between our posts
  rules             text,                         -- group rules worth remembering
  requires_approval boolean NOT NULL DEFAULT false,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fb_groups_owner_url_unique UNIQUE (owner_email, url)
);

-- == Copy ===================================================
CREATE TABLE IF NOT EXISTS public.fb_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key   text REFERENCES public.fb_role_templates(role_key) ON DELETE SET NULL,
  job_id     uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  title      text NOT NULL,
  body       text NOT NULL,                   -- the base copy
  angle      text,                            -- שכר / דיור / התחלה מיידית ...
  status     text NOT NULL DEFAULT 'draft'
             CHECK (status IN ('draft', 'ready', 'archived')),
  created_by text,                            -- recruiter email
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fb_variants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.fb_posts(id) ON DELETE CASCADE,
  body       text NOT NULL,
  label      text,                            -- "וריאציה 2 - פוקוס דיור"
  times_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- == The queue ==============================================
CREATE TABLE IF NOT EXISTS public.fb_publications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid NOT NULL REFERENCES public.fb_posts(id) ON DELETE CASCADE,
  group_id      uuid NOT NULL REFERENCES public.fb_groups(id) ON DELETE CASCADE,
  variant_id    uuid REFERENCES public.fb_variants(id) ON DELETE SET NULL,
  owner_email   text,                          -- recruiter who owns the group
  body_snapshot text NOT NULL,                 -- exactly what was pasted
  tracking_code text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'posted', 'skipped', 'removed')),
  scheduled_for timestamptz,
  posted_at     timestamptz,
  post_url      text,                          -- link to the live FB post
  responses     integer NOT NULL DEFAULT 0,    -- how many people wrote in
  notes         text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.publishing_settings (
  id            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  contact_phone text,                          -- number the CTA points at
  contact_name  text,
  signature     text,                          -- fixed footer appended to posts
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.publishing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS fb_groups_owner_idx
  ON public.fb_groups (owner_email, is_active);
CREATE INDEX IF NOT EXISTS fb_publications_group_posted_idx
  ON public.fb_publications (group_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS fb_publications_post_idx
  ON public.fb_publications (post_id);
CREATE INDEX IF NOT EXISTS fb_publications_status_idx
  ON public.fb_publications (status, scheduled_for);
CREATE INDEX IF NOT EXISTS fb_variants_post_idx
  ON public.fb_variants (post_id);

-- updated_at bookkeeping - reuses public.update_updated_at() from 00050.
DROP TRIGGER IF EXISTS fb_role_templates_touch ON public.fb_role_templates;
CREATE TRIGGER fb_role_templates_touch BEFORE UPDATE ON public.fb_role_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS fb_groups_touch ON public.fb_groups;
CREATE TRIGGER fb_groups_touch BEFORE UPDATE ON public.fb_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS fb_posts_touch ON public.fb_posts;
CREATE TRIGGER fb_posts_touch BEFORE UPDATE ON public.fb_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS fb_publications_touch ON public.fb_publications;
CREATE TRIGGER fb_publications_touch BEFORE UPDATE ON public.fb_publications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS: signed-in recruiters read/write; anon has no access (see 00046).
ALTER TABLE public.fb_role_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_variants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_publications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fb_role_templates','fb_groups','fb_posts','fb_variants','fb_publications','publishing_settings']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_authenticated_all" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_authenticated_all" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t);
  END LOOP;
END $$;

-- Bump a variant's usage counter atomically (called when a publication is
-- marked posted) so rotation can prefer the least-used text.
CREATE OR REPLACE FUNCTION public.increment_variant_use(v_id uuid)
RETURNS void LANGUAGE sql AS $fn$
  UPDATE public.fb_variants SET times_used = times_used + 1 WHERE id = v_id;
$fn$;
