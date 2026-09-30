-- 00093: סוג מועמד, "מגיע עם חבר" וסיבת אי-הגעה.
-- העובדים שנשארים הכי הרבה זמן מגיעים עם מטרה ותאריך (בוגרי פנימיות עד
-- הגיוס, עולים, עבודה מועדפת), ומועמדים שמגיעים עם חבר מגיעים יותר — אבל
-- כשהחבר מתחרט גם הם לא מגיעים. בלי השדות האלה אי אפשר למדוד אף אחד מזה.
-- הקודים (CANDIDATE_SEGMENTS, NO_ARRIVAL_REASONS ב-src/lib/constants.ts)
-- נשמרים כ-TEXT בלי CHECK — הוולידציה בשרת.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS candidate_segment text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS comes_with_friend boolean;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS companion_name text;

-- "לא הגיע" / "ביטל הגעה" — הסיבה נשמרת על הליד גם אחרי שהסטטוס מתקדם
-- (למשל לתיאום הגעה מחדש), כדי שדוח ההגעה ידע שהיה ניסיון שנכשל.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS no_arrival_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS no_arrival_notes text;

CREATE INDEX IF NOT EXISTS idx_leads_candidate_segment
  ON public.leads (candidate_segment)
  WHERE candidate_segment IS NOT NULL;
