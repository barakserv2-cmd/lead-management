-- 00092: סיבת סיום העסקה.
-- עד עכשיו "סיום העסקה" שמר רק תאריך, ולכן לא היה אפשר לדעת למה עובדים
-- עוזבים אחרי חודש-שלושה במקום להשלים חצי שנה. הקוד (EMPLOYMENT_END_REASONS
-- ב-src/lib/constants.ts) נבחר בדיאלוג הסיום; הטקסט החופשי משלים אותו.
-- הקוד נשמר כ-TEXT בלי CHECK כדי שאפשר יהיה להוסיף סיבה בלי מיגרציה —
-- הוולידציה בשרת (changeLeadStatus / PATCH /api/leads/[id]).

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS employment_end_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS employment_end_notes text;

-- דוח השימור מקבץ עזיבות לפי סיבה
CREATE INDEX IF NOT EXISTS idx_leads_employment_end_reason
  ON public.leads (employment_end_reason)
  WHERE employment_end_reason IS NOT NULL;
