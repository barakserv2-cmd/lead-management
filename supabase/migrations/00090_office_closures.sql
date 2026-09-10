-- 00090: ימי סגירה של המשרד.
--
-- חגי ישראל מחושבים בקוד מלוח השנה העברי (src/lib/israelHolidays.ts) ולכן
-- אינם צריכים טבלה. מה שאי אפשר לגזור מהלוח — יום העצמאות, יום הזיכרון,
-- יום גישור, סגירה של החברה עצמה — נשמר כאן, ידנית.
--
-- הרקע: גובגט קבע ראיון טלפוני לראש השנה ב׳ כי מחולל החלונות הכיר רק ימים
-- בשבוע. החגים נחסמו בקוד; הטבלה הזו סוגרת את השאר.

CREATE TABLE IF NOT EXISTS public.office_closures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- תאריך קיר ישראלי, בלי אזור זמן — כמו שאר מערכת הראיונות
  closure_date date NOT NULL UNIQUE,
  name         text NOT NULL,
  -- יום קצר: אפשר לקבוע ראיון בבוקר בלבד
  half_day     boolean NOT NULL DEFAULT false,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS office_closures_date_idx
  ON public.office_closures (closure_date);

ALTER TABLE public.office_closures ENABLE ROW LEVEL SECURITY;

-- כל רכזת צריכה לראות מתי סגור (הלוח, ההודעות למועמדים). הכתיבה עוברת רק
-- דרך ה-API של האדמין, שמשתמש ב-service role ועוקף RLS ממילא.
DROP POLICY IF EXISTS office_closures_read ON public.office_closures;
CREATE POLICY office_closures_read ON public.office_closures
  FOR SELECT TO authenticated
  USING (public.is_recruiter());
