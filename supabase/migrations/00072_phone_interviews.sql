-- ============================================================
-- Migration: phone interviews + 5-minute slots (בקשת סער 31.08)
-- 1. סוג ראיון חדש 'phone' — וברירת המחדל של תיאום עצמי.
-- 2. רשת של 5 דקות מותרת בחלונות הזמינות.
-- 3. Seed: לכל משתמש בלי חלונות — ראשון–חמישי 08:00–17:00 כל 5 דק'.
-- ============================================================

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_interview_type_check;
ALTER TABLE leads ADD CONSTRAINT leads_interview_type_check
  CHECK (interview_type IN ('in_person', 'video', 'phone'));

ALTER TABLE booking_tokens DROP CONSTRAINT IF EXISTS booking_tokens_interview_type_check;
ALTER TABLE booking_tokens ADD CONSTRAINT booking_tokens_interview_type_check
  CHECK (interview_type IN ('in_person', 'video', 'phone'));
ALTER TABLE booking_tokens ALTER COLUMN interview_type SET DEFAULT 'phone';

ALTER TABLE availability_slots DROP CONSTRAINT IF EXISTS availability_slots_slot_minutes_check;
ALTER TABLE availability_slots ADD CONSTRAINT availability_slots_slot_minutes_check
  CHECK (slot_minutes IN (5, 10, 15, 20, 30, 45, 60));

-- חלונות ברירת מחדל למי שעוד לא הגדיר: א'–ה' (weekday 0-4 לפי getUTCDay),
-- 08:00 (480) עד 17:00 (1020), ראיון טלפוני כל 5 דקות.
INSERT INTO availability_slots (recruiter_email, weekday, start_minute, end_minute, slot_minutes)
SELECT lower(u.email), wd, 480, 1020, 5
FROM user_profiles u
CROSS JOIN generate_series(0, 4) AS wd
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM availability_slots a WHERE a.recruiter_email = lower(u.email)
  );
