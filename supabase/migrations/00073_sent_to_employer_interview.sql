-- 00073: "נשלח לראיון" — המועמד הגיע למשרד ונשלח לראיון אצל המעסיק.
--
-- שלב שלא היה מיוצג בכלל: הליד נשאר "הגיע לראיון" בלי שום תיעוד לאיזו משרה
-- הוא נשלח ומתי הראיון אצל המעסיק. הרכזת לא יכלה לדעת במי לטפל ומתי.
--
-- אזור-זמן: sent_interview_at בקונבנציית המערכת — שעון-קיר ישראלי עם תווית
-- UTC, בדיוק כמו leads.interview_date. קריאה/כתיבה בשדות UTC בלבד.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sent_to_job_id    UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_interview_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_sent_interview
  ON public.leads (sent_interview_at)
  WHERE sent_interview_at IS NOT NULL;
