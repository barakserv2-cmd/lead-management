-- 00047: one candidate = one phone number.
--
-- Until now `leads.phone` was UNIQUE on the raw string, so the same person
-- slipped in as "050-1234567", "0501234567" and "+972501234567". This
-- migration:
--   1. defines normalize_phone(): canonical Israeli form is 10 digits, no
--      punctuation ("0501234567"); +972 / 972 / 00972 / missing leading 0 are
--      folded in; sentinels (no-phone-*, anon-*) and non-Israeli / garbage
--      values are left recognisable but digits-only.
--   2. auto-merges every existing group of cards that share a normalized
--      phone via merge_leads() (00043) — winner = furthest along the pipeline,
--      audit rows written for each merge.
--   3. rewrites every stored phone to its canonical form.
--   4. installs a BEFORE INSERT/UPDATE trigger so every future write is
--      normalized before the UNIQUE(phone) index sees it → the DB itself now
--      refuses a second card for the same number regardless of formatting.

CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  raw text;
  d   text;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  raw := btrim(p);
  IF raw = '' THEN RETURN NULL; END IF;
  -- sentinels used by bulk import / anonymization stay untouched
  IF raw ~ '^(no-phone-|anon-)' THEN RETURN raw; END IF;

  d := regexp_replace(raw, '\D', '', 'g');
  IF d = '' THEN RETURN raw; END IF;              -- free text, not a number

  IF d ~ '^00972' THEN d := substr(d, 3); END IF;  -- 00972… → 972…
  IF d ~ '^972' AND length(d) BETWEEN 11 AND 12 THEN
    d := '0' || substr(d, 4);                       -- 972-5x-xxxxxxx → 05x…
  END IF;
  IF length(d) = 9 AND d ~ '^[2-9]' THEN
    d := '0' || d;                                  -- dropped leading 0
  END IF;

  IF length(d) = 10 AND d ~ '^0' THEN RETURN d; END IF;   -- canonical IL

  -- foreign / short / odd: keep it digits-only (with + if it was international)
  IF raw ~ '^\+' THEN RETURN '+' || d; END IF;
  RETURN d;
END;
$$;

-- ── 2. merge existing duplicates (same normalized phone) ────────────────
DO $$
DECLARE
  g      record;
  keep   uuid;
  other  uuid;
  winner uuid;
  loser  uuid;
  i      int;
  merged int := 0;
BEGIN
  FOR g IN
    SELECT public.normalize_phone(phone) AS ph,
           array_agg(id ORDER BY created_at) AS ids
    FROM public.leads
    WHERE phone IS NOT NULL
      AND public.normalize_phone(phone) ~ '^0\d{9}$'
    GROUP BY 1
    HAVING count(*) > 1
  LOOP
    keep := g.ids[1];
    FOR i IN 2 .. array_length(g.ids, 1) LOOP
      other  := g.ids[i];
      winner := public.merge_leads(keep, other);
      loser  := CASE WHEN winner = keep THEN other ELSE keep END;
      INSERT INTO public.audit_log (actor, actor_type, action, entity, lead_id, meta)
      VALUES
        ('migration-00047', 'system', 'merge', 'lead', winner,
         jsonb_build_object('absorbed', loser, 'phone', g.ph, 'auto', true)),
        ('migration-00047', 'system', 'merge', 'lead', loser,
         jsonb_build_object('merged_into', winner, 'phone', g.ph, 'auto', true, 'deleted', true));
      keep := winner;
      merged := merged + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'merged % duplicate lead cards', merged;
END;
$$;

-- ── 3. canonicalise every stored phone ──────────────────────────────────
UPDATE public.leads
SET phone = public.normalize_phone(phone)
WHERE phone IS NOT NULL
  AND phone IS DISTINCT FROM public.normalize_phone(phone);

-- ── 4. trigger: normalize on every write ────────────────────────────────
CREATE OR REPLACE FUNCTION public.leads_normalize_phone_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone := public.normalize_phone(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_normalize_phone ON public.leads;
CREATE TRIGGER trg_leads_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_normalize_phone_trg();

-- ── 5. lookup helper: which card owns this number? ──────────────────────
-- Used by the app for a friendly "already exists" answer before hitting the
-- unique index (and by the merge dialog).
CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_phone text)
RETURNS TABLE (id uuid, name text, phone text, status text, sub_status text)
LANGUAGE sql
STABLE
AS $$
  SELECT l.id, l.name, l.phone, l.status, l.sub_status
  FROM public.leads l
  WHERE l.phone = public.normalize_phone(p_phone)
  LIMIT 1;
$$;
