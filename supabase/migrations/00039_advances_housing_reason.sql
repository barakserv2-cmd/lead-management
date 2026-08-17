-- 00039: advances = housing deductions (מקדמות לדיור). Add the reason payroll needs.
--   requested        — העובד/ת ביקש/ה לנכות לטובת השכירות
--   self_rent        — שוכר/ת דירה לבד (לא במגורי החברה)
--   stopped_working  — הפסיק/ה להגיע לעבודה אבל נשאר/ה במגורים
ALTER TABLE public.advances
  ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT 'requested'
    CHECK (reason IN ('requested', 'self_rent', 'stopped_working'));
