-- ============================================================
-- Migration: client contact phones — אנשי קשר של לקוחות בוואטסאפ
-- הוואטסאפ של מלי מכיל גם נציגי לקוחות (למשל הגר — גמבו). מספר
-- שמופיע אצל לקוח (הראשי או ברשימה הזו) לא הופך לעולם לליד מועמד.
-- מספרים נשמרים מנורמלים: 10 ספרות (05XXXXXXXX).
-- ============================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_phones TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_clients_contact_phones ON clients USING GIN (contact_phones);
