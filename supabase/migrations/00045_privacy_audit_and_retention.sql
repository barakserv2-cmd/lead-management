-- 00045: privacy compliance — audit log, retention/anonymization, DSAR support.
-- חוק הגנת הפרטיות + תקנות אבטחת מידע (רמה בינונית):
--   * תקנה 10 — תיעוד גישה למאגר (מי, מתי, איזו רשומה, איזו פעולה), נשמר 24 חודש.
--   * צמצום מידע — מחיקה/אנונימיזציה של רשומות שאין בהן צורך.
--   * זכות עיון/תיקון/מחיקה של נושא המידע.

-- ── 1. audit_log ────────────────────────────────────────────
-- Append-only. lead_id has NO FK on purpose: the audit row must survive
-- deletion of the lead (the deletion itself is an audited event).
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor        TEXT NOT NULL,                       -- user email | 'system' | 'cron' | 'api-key'
  actor_type   TEXT NOT NULL DEFAULT 'user'
               CHECK (actor_type IN ('user','system','cron','api')),
  action       TEXT NOT NULL
               CHECK (action IN (
                 'view','list','create','update','status_change','note',
                 'export','anonymize','delete','merge','import','login'
               )),
  entity       TEXT NOT NULL DEFAULT 'lead',
  lead_id      UUID,
  changes      JSONB,                               -- {field: {from, to}} for updates
  meta         JSONB,                               -- free-form context (path, ids, counts)
  ip           TEXT,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_lead_id     ON public.audit_log (lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at ON public.audit_log (occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor       ON public.audit_log (actor, occurred_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Recruiters may read the log (for the "who touched this record" panel) and
-- append to it. No UPDATE / DELETE policy for anyone except service role —
-- an audit trail that can be edited is not an audit trail.
DROP POLICY IF EXISTS "audit_log_authenticated_select" ON public.audit_log;
CREATE POLICY "audit_log_authenticated_select"
  ON public.audit_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "audit_log_authenticated_insert" ON public.audit_log;
CREATE POLICY "audit_log_authenticated_insert"
  ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- ── 2. leads: anonymization marker ──────────────────────────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_anonymized_at ON public.leads (anonymized_at)
  WHERE anonymized_at IS NOT NULL;

-- ── 3. anonymize_lead(uuid) ─────────────────────────────────
-- Strips every personal-data field but keeps the pipeline skeleton
-- (status, source, dates, hired_client) so reports/statistics stay intact.
-- Child tables that hold free text about the person are wiped; the
-- status history and journal are kept but scrubbed. Storage objects for
-- lead_documents must be removed by the caller BEFORE calling this
-- (the function only knows about the metadata rows).
CREATE OR REPLACE FUNCTION public.anonymize_lead(p_lead_id uuid, p_actor text DEFAULT 'system')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_short  text := left(replace(p_lead_id::text, '-', ''), 8);
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id) INTO v_exists;
  IF NOT v_exists THEN RETURN false; END IF;

  -- child tables with personal content
  DELETE FROM public.messages         WHERE lead_id = p_lead_id;
  DELETE FROM public.lead_notes       WHERE lead_id = p_lead_id;
  DELETE FROM public.interaction_logs WHERE lead_id = p_lead_id;
  DELETE FROM public.lead_documents   WHERE lead_id = p_lead_id;
  DELETE FROM public.reminders        WHERE lead_id = p_lead_id;
  DELETE FROM public.cron_reminders   WHERE lead_id = p_lead_id;

  -- keep the journal + status history as skeleton, drop the free text
  UPDATE public.lead_events
     SET event_text = '[נמחק — אנונימיזציה]'
   WHERE lead_id = p_lead_id;
  UPDATE public.lead_status_history
     SET notes = NULL
   WHERE lead_id = p_lead_id AND notes IS NOT NULL;

  UPDATE public.leads SET
    name                          = 'מועמד/ת (נמחק/ה) ' || v_short,
    phone                         = 'anon-' || v_short,           -- phone is UNIQUE
    email                         = NULL,
    location                      = NULL,
    experience                    = NULL,
    age                           = NULL,
    notes                         = NULL,
    original_email_body           = NULL,
    original_email_id             = NULL,
    original_email_from           = NULL,
    original_email_subject        = NULL,
    raw_content                   = NULL,
    preferences                   = NULL,
    extracted_availability        = NULL,
    extracted_salary_expectation  = NULL,
    extracted_location_pref       = NULL,
    extracted_interests           = NULL,
    tags                          = NULL,
    interview_notes               = NULL,
    followup_notes                = NULL,
    rejection_reason              = NULL,
    attention_reason              = NULL,
    human_attention_reason        = NULL,
    anonymized_at                 = now()
  WHERE id = p_lead_id;

  INSERT INTO public.audit_log (actor, actor_type, action, entity, lead_id, meta)
  VALUES (p_actor,
          CASE WHEN p_actor LIKE '%@%' THEN 'user' ELSE 'system' END,
          'anonymize', 'lead', p_lead_id,
          jsonb_build_object('via', 'anonymize_lead()'));

  RETURN true;
END;
$$;

-- ── 4. retention_candidates(months, months_hired) ───────────
-- Leads whose *last activity* (max of created/handled/assigned timestamps,
-- last event, last message, last status change, interview/start date) is older than the retention window and that are not
-- already anonymized. Hired/started candidates get a longer window because
-- an employment relationship carries its own record-keeping duties.
CREATE OR REPLACE FUNCTION public.retention_candidates(
  p_months        int DEFAULT 24,
  p_months_hired  int DEFAULT 84,
  p_limit         int DEFAULT 500
)
RETURNS TABLE (id uuid, status text, last_activity timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH act AS (
    SELECT l.id, l.status,
           GREATEST(
             l.created_at,
             COALESCE(l.handled_at, l.created_at),
             COALESCE(l.assigned_at, l.created_at),
             COALESCE(l.needs_attention_at, l.created_at),
             COALESCE(l.human_attention_raised_at, l.created_at),
             COALESCE((SELECT max(e.created_at) FROM public.lead_events e WHERE e.lead_id = l.id), l.created_at),
             COALESCE((SELECT max(m.created_at) FROM public.messages m WHERE m.lead_id = l.id), l.created_at),
             COALESCE((SELECT max(h.changed_at) FROM public.lead_status_history h WHERE h.lead_id = l.id), l.created_at),
             COALESCE(l.start_date::timestamptz, l.created_at),
             COALESCE(l.interview_date::timestamptz, l.created_at)
           ) AS last_activity
    FROM public.leads l
    WHERE l.anonymized_at IS NULL
  )
  SELECT id, status, last_activity
  FROM act
  WHERE last_activity < now() - (
          CASE WHEN status IN ('HIRED','STARTED') THEN p_months_hired ELSE p_months END
        ) * INTERVAL '1 month'
  ORDER BY last_activity
  LIMIT p_limit;
$$;

-- ── 5. purge_audit_log(months) ──────────────────────────────
-- Access-log retention per regulation 10(ד): keep 24 months, then drop.
CREATE OR REPLACE FUNCTION public.purge_audit_log(p_months int DEFAULT 24)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM public.audit_log
   WHERE occurred_at < now() - p_months * INTERVAL '1 month';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON TABLE  public.audit_log       IS 'תיעוד גישה ושינויים למאגר המועמדים — תקנה 10 לתקנות אבטחת מידע. append-only, נשמר 24 חודש.';
COMMENT ON FUNCTION public.anonymize_lead(uuid, text) IS 'מחיקת מידע אישי מרשומת ליד תוך שמירת שלד סטטיסטי. הקורא אחראי למחוק קבצים מה-storage לפני.';
