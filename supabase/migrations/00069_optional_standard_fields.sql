-- ============================================================
-- Migration: שדות סטנדרטיים כרשות
-- Description: optional_fields — אילו שדות סטנדרטיים (טלפון,
--              אימייל, כתובת...) מתוך required_fields הם רשות:
--              מוצגים למועמד אבל אפשר לדלג. נשלט מדף הגדרות
--              השדות שסער ממלא.
-- ============================================================

ALTER TABLE signature_templates
  ADD COLUMN IF NOT EXISTS optional_fields JSONB NOT NULL DEFAULT '[]';

ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS optional_fields JSONB;
