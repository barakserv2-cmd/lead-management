-- ============================================================
-- 00100: ערוץ גיוס מדויק לכל ליד (סער, 30.09)
--
-- "מקור" ערבב דרך פנייה ("טלפון") עם מוצא ("גוגל ממומן"), ולכן אי אפשר
-- היה לדעת איזה ערוץ עובד. שלושה שדות נפרדים, שממלא lib/leadChannel.ts:
--   channel         — איפה שמע עלינו
--   contact_method  — איך יצר קשר
--   campaign        — איזו מודעה / קבוצה / דף, כשידוע
--   channel_set_by  — 'auto' (כללים), 'recruiter' (נבחר ביד), 'backfill'
-- "מקור" נשאר כמו שהוא — לא שוברים מסכים ודוחות קיימים.
-- ============================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS contact_method TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS campaign TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS channel_set_by TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_channel_created ON public.leads (channel, created_at DESC);
-- המילוי השוטף מחפש לידים בלי ערוץ
CREATE INDEX IF NOT EXISTS idx_leads_channel_missing ON public.leads (created_at DESC) WHERE channel IS NULL;
