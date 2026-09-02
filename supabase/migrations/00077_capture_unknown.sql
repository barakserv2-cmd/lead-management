-- ============================================================
-- Migration: capture_unknown — קליטת הודעות ממספרים לא מוכרים
-- מספר עם capture_unknown=true (המספר העסקי של מלי) יוצר ליד חדש
-- לכל פונה לא מוכר. המספרים האישיים של הרכזות נשארים false — אנשי
-- הקשר הפרטיים שלהן לא הופכים ללידים.
-- ============================================================

ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS capture_unknown BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE whatsapp_accounts SET capture_unknown = TRUE WHERE instance_id = '710322726170';
