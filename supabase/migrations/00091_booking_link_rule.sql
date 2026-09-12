-- ============================================================
-- 00091: פעולת "שלח לינק תיאום" במנוע החוקים + החוק הראשון
-- החלטת ועדת המומחים 12.09 (#6): ליד חדש בלי מענה 4 שעות מקבל
-- אוטומטית לינק תיאום ראיון עצמי — מפעיל בבת אחת את שני הפיצ'רים
-- שעמדו בצד. נזרע כבוי; ההדלקה של סער בהגדרות ← אוטומציה.
-- ============================================================

ALTER TABLE automation_rules DROP CONSTRAINT IF EXISTS automation_rules_action_type_check;
ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_action_type_check
  CHECK (action_type IN ('message_candidate', 'raise_flag', 'notify_recruiter', 'notify_admin', 'send_booking_link'));

INSERT INTO automation_rules (name, description, enabled, trigger_type, params, action_type, template, sort_order)
SELECT
  'אין מענה 4 שעות — לינק תיאום עצמי',
  'ליד חדש שאף אחת לא הספיקה אליו 4 שעות מקבל הודעה + קישור לקביעת ראיון טלפוני לבד. רק לידים טריים (עד 72 שעות) — הערימה הישנה לא נגללת.',
  FALSE,
  'status_age',
  '{"status": "NEW_LEAD", "hours": 4, "max_hours": 72}'::jsonb,
  'send_booking_link',
  'היי {{שם}} 😊 ראינו את הפנייה שלך לעבודה באילת עם מגורים — מתנצלים שעוד לא הספקנו להתקשר! אפשר לחסוך את התיאום ולקבוע ראיון טלפוני קצר ישר ביומן:',
  15
WHERE NOT EXISTS (SELECT 1 FROM automation_rules WHERE action_type = 'send_booking_link');
