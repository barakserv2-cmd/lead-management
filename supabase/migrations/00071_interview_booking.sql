-- ============================================================
-- Migration: interview self-booking — תיאום ראיון עצמי (שלב 4)
-- המועמד מקבל לינק וואטסאפ עם טוקן חד-פעמי (תבנית signature_requests),
-- בוחר חלון פנוי מלוח הרכזת, וההזמנה נתפסת אטומית.
--
-- אזור-זמן: starts_at נשמר בקונבנציית המערכת — שעון-קיר ישראלי עם
-- תווית UTC (כמו leads.interview_date). קריאה/כתיבה עם שדות UTC בלבד.
-- ============================================================

-- חלונות הזמינות השבועיים של כל רכזת. weekday לפי getUTCDay: 0=ראשון.
CREATE TABLE IF NOT EXISTS availability_slots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_email TEXT        NOT NULL,
  weekday         INT         NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute    INT         NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute      INT         NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  slot_minutes    INT         NOT NULL DEFAULT 20 CHECK (slot_minutes IN (10, 15, 20, 30, 45, 60)),
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_minute > start_minute)
);
CREATE INDEX IF NOT EXISTS idx_availability_slots_recruiter ON availability_slots (recruiter_email);

-- טוקן ההזמנה שנשלח למועמד. אותו לינק משמש גם לשינוי מועד ולביטול.
CREATE TABLE IF NOT EXISTS booking_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  recruiter_email TEXT        NOT NULL,
  token           TEXT        NOT NULL UNIQUE,
  interview_type  TEXT        NOT NULL DEFAULT 'in_person'
                    CHECK (interview_type IN ('in_person', 'video')),
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'booked', 'cancelled')),
  booked_start    TIMESTAMPTZ,
  sent_by         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);
CREATE INDEX IF NOT EXISTS idx_booking_tokens_lead  ON booking_tokens (lead_id);
CREATE INDEX IF NOT EXISTS idx_booking_tokens_token ON booking_tokens (token);

-- ההזמנות עצמן. האינדקס הייחודי החלקי הוא מנגנון מניעת הכפילות:
-- שתי לחיצות בו-זמניות על אותו חלון — השנייה נופלת על unique_violation.
CREATE TABLE IF NOT EXISTS interview_bookings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id        UUID        REFERENCES booking_tokens(id) ON DELETE SET NULL,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  recruiter_email TEXT        NOT NULL,
  starts_at       TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_interview_booking_slot
  ON interview_bookings (recruiter_email, starts_at) WHERE status = 'booked';
CREATE INDEX IF NOT EXISTS idx_interview_bookings_recruiter ON interview_bookings (recruiter_email, starts_at);

ALTER TABLE availability_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_bookings  ENABLE ROW LEVEL SECURITY;

-- הדף הציבורי עובר דרך service role בלבד — אין policies ל-anon.
CREATE POLICY "authenticated_all_availability_slots"
  ON availability_slots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_booking_tokens"
  ON booking_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_interview_bookings"
  ON interview_bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- הזמנה אטומית: תפיסת החלון החדש קודם (הייחודיות תופסת מרוץ), רק אחר
-- כך שחרור ההזמנה הקודמת של הטוקן — כדי ששינוי מועד שנכשל לא ישאיר
-- את המועמד בלי המועד הישן.
CREATE OR REPLACE FUNCTION book_interview_slot(p_token TEXT, p_starts_at TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t booking_tokens%ROWTYPE;
  new_booking_id UUID;
  was_booked BOOLEAN;
BEGIN
  SELECT * INTO t FROM booking_tokens WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF t.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cancelled');
  END IF;
  IF t.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  was_booked := t.status = 'booked';

  BEGIN
    INSERT INTO interview_bookings (token_id, lead_id, recruiter_email, starts_at)
    VALUES (t.id, t.lead_id, t.recruiter_email, p_starts_at)
    RETURNING id INTO new_booking_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_taken');
  END;

  UPDATE interview_bookings
     SET status = 'cancelled'
   WHERE token_id = t.id AND status = 'booked' AND id <> new_booking_id;

  UPDATE booking_tokens
     SET status = 'booked', booked_start = p_starts_at
   WHERE id = t.id;

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', t.lead_id,
    'recruiter_email', t.recruiter_email,
    'interview_type', t.interview_type,
    'rebooked', was_booked
  );
END;
$$;
