-- ============================================================
-- 00097: סטטוס מסירה לכל הודעה יוצאת — נשלחה / נמסרה / נקראה / נכשלה
--
-- 16.09 סער שאל איך הוא יודע שמועמד באמת קיבל הודעה. התשובה הייתה שאי
-- אפשר: המערכת ידעה רק שמטא *קיבלה* את ההודעה. מטא, 360dialog ו-GreenAPI
-- שולחים אחרי זה עדכון על כל הודעה (נמסרה, נקראה, נכשלה), אבל כל שלושת
-- הערוצים אישרו את העדכון וזרקו אותו.
--
-- הכישלון הוא החלק החשוב: מטא יכולה לקבל הודעה ולהכשיל אותה אחר כך — למשל
-- כשהמספר של המועמד לא בוואטסאפ. בלי העדכון הזה ליד נראה "בקשר" כשלא הגיע
-- אליו כלום, ורכזת מדלגת עליו.
--
-- provider_msg_id הוא המפתח שמחבר עדכון להודעה: wamid של מטא/360dialog,
-- או idMessage של GreenAPI. הודעות ישנות בלי מזהה נשארות בלי סטטוס — עדיף
-- "לא ידוע" מאשר וי שלא נבדק.
-- ============================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider_msg_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_error TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_delivery_status_check;
ALTER TABLE messages ADD CONSTRAINT messages_delivery_status_check
  CHECK (delivery_status IS NULL OR delivery_status IN ('sent', 'delivered', 'read', 'failed'));

-- עדכון מגיע רק עם המזהה, אז החיפוש לפיו חייב להיות מהיר
CREATE INDEX IF NOT EXISTS idx_messages_provider_msg_id
  ON messages (provider_msg_id) WHERE provider_msg_id IS NOT NULL;

COMMENT ON COLUMN messages.provider_msg_id IS 'מזהה ההודעה אצל הספק (wamid / idMessage) — מחבר אליה עדכוני מסירה';
COMMENT ON COLUMN messages.delivery_status IS 'sent / delivered / read / failed. NULL = לא ידוע (הודעה ישנה או נכנסת)';
COMMENT ON COLUMN messages.delivery_error IS 'סיבת הכישלון בעברית, כשהסטטוס failed';
