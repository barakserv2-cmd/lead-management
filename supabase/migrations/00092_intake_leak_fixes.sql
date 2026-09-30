-- ============================================================
-- 00092: תיקוני דליפות מדידה — ועדת נפח הלידים 12.09 (החלטות 1-3)
--
-- (1) פנייה חוזרת: מועמד קיים שפונה שוב נבלע היום בשקט (דדופ במייל
--     וב-API) — ולכן ככל שהמאגר גדל, ספירת ה"חדשים" יורדת מכנית.
--     מעכשיו: אירוע מתועד + מונה על הליד + דגל לרכזת.
-- (2) פניות ללא ליד: מי שכותב בוואטסאפ ולא מזוהה נזרק היום בלי זכר.
--     מעכשיו נרשם לצפייה בלבד — בלי יצירת ליד (ההוראה של סער על
--     המספר של מלי בתוקף), נציגי לקוחות מסומנים בנפרד.
-- (3) התראת בריאות ערוץ: אין סכמה — משתמש ב-cron_reminders הקיימת.
-- ============================================================

-- ── (1) פנייה חוזרת ─────────────────────────────────────────

ALTER TABLE leads ADD COLUMN IF NOT EXISTS repeat_inquiries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_repeat_at TIMESTAMPTZ;

-- הכל בפונקציה אחת כדי שהמונה, האירוע והדגל יעודכנו יחד ואטומית.
-- p_occurrence_key: מיילים של לידים נשארים לא-נקראים ונסרקים שוב ושוב —
-- המפתח (repeat:<email_id>) מבטיח שכל מייל נספר פעם אחת בלבד.
CREATE OR REPLACE FUNCTION public.record_repeat_inquiry(
  p_lead_id UUID,
  p_channel TEXT,
  p_detail TEXT DEFAULT NULL,
  p_occurrence_key TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_occurrence_key IS NOT NULL THEN
    INSERT INTO cron_reminders (lead_id, reminder_type, occurrence_key, payload)
    VALUES (p_lead_id, 'repeat_inquiry', p_occurrence_key,
            jsonb_build_object('channel', p_channel, 'detail', p_detail))
    ON CONFLICT (occurrence_key) DO NOTHING;
    IF NOT FOUND THEN
      SELECT repeat_inquiries INTO v_count FROM leads WHERE id = p_lead_id;
      RETURN COALESCE(v_count, 0);
    END IF;
  END IF;

  UPDATE leads
  SET repeat_inquiries   = repeat_inquiries + 1,
      last_repeat_at     = now(),
      needs_attention    = TRUE,
      needs_attention_at = now(),
      attention_reason   = 'פנייה חוזרת דרך ' || COALESCE(p_channel, 'ערוץ לא ידוע')
  WHERE id = p_lead_id
  RETURNING repeat_inquiries INTO v_count;

  IF v_count IS NULL THEN
    RETURN 0; -- הליד נמחק בינתיים — אין מה לתעד
  END IF;

  INSERT INTO lead_events (lead_id, event_type, event_text, created_by)
  VALUES (
    p_lead_id,
    'פנייה חוזרת',
    'המועמד/ת פנה/תה שוב דרך ' || COALESCE(p_channel, 'ערוץ לא ידוע')
      || COALESCE(' — ' || p_detail, '')
      || ' (פנייה חוזרת #' || v_count || ')',
    'מערכת'
  );

  RETURN v_count;
END;
$$;

-- שרת בלבד (כמו 00089): הדפדפן עם מפתח anon לא מזייף פניות חוזרות.
REVOKE ALL ON FUNCTION public.record_repeat_inquiry(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_repeat_inquiry(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ── (2) פניות ללא ליד ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS unmatched_inbound (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- שורה אחת לכל מספר — פניות חוזרות מעלות מונה במקום לייצר שורות
  phone             TEXT        NOT NULL UNIQUE,
  sender_name       TEXT,
  instance_id       TEXT,
  last_message      TEXT,
  message_count     INTEGER     NOT NULL DEFAULT 1,
  is_client_contact BOOLEAN     NOT NULL DEFAULT FALSE,
  client_name       TEXT,
  first_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unmatched_inbound_last_at ON unmatched_inbound (last_at DESC);

ALTER TABLE unmatched_inbound ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unmatched_inbound_recruiter_read" ON unmatched_inbound
  FOR SELECT TO authenticated USING (is_recruiter());
-- אין policy לכתיבה — רק ה-webhook (service role) כותב.

CREATE OR REPLACE FUNCTION public.record_unmatched_inbound(
  p_phone TEXT,
  p_sender_name TEXT,
  p_instance_id TEXT,
  p_message TEXT,
  p_is_client BOOLEAN DEFAULT FALSE,
  p_client_name TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO unmatched_inbound
    (phone, sender_name, instance_id, last_message, is_client_contact, client_name)
  VALUES
    (p_phone, NULLIF(TRIM(p_sender_name), ''), p_instance_id, LEFT(p_message, 500),
     COALESCE(p_is_client, FALSE), p_client_name)
  ON CONFLICT (phone) DO UPDATE SET
    message_count     = unmatched_inbound.message_count + 1,
    last_message      = EXCLUDED.last_message,
    sender_name       = COALESCE(EXCLUDED.sender_name, unmatched_inbound.sender_name),
    instance_id       = EXCLUDED.instance_id,
    is_client_contact = EXCLUDED.is_client_contact,
    client_name       = COALESCE(EXCLUDED.client_name, unmatched_inbound.client_name),
    last_at           = now();
$$;

REVOKE ALL ON FUNCTION public.record_unmatched_inbound(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_unmatched_inbound(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO service_role;
