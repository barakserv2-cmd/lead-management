-- 00069: מתי נקבע תת-הסטטוס הנוכחי.
--
-- "אין מענה 1 → 2 → 3" הוא רצף של ניסיונות חיוג, אבל שינוי תת-סטטוס לא נשמר
-- בשום מקום עם חותמת זמן על הליד — אי אפשר היה לדעת אם "אין מענה 2" נקבע
-- אתמול או לפני שבועיים, וזה בדיוק מה שקובע איך ממשיכים מול המועמד.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sub_status_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_sub_status_at
  ON public.leads (sub_status_at DESC NULLS LAST)
  WHERE sub_status IS NOT NULL;

-- ── Backfill ────────────────────────────────────────────────
-- יומן הביקורת מתעד כל שינוי תת-סטטוס מאז 19/08/2026 (779 שינויים על 481
-- לידים). לוקחים את המאוחר ביותר לכל ליד.
UPDATE public.leads l
SET sub_status_at = a.last_at
FROM (
  SELECT lead_id, max(occurred_at) AS last_at
  FROM public.audit_log
  WHERE changes ? 'sub_status' AND lead_id IS NOT NULL
  GROUP BY lead_id
) a
WHERE a.lead_id = l.id
  AND l.sub_status IS NOT NULL
  AND l.sub_status_at IS NULL;

-- לידים שיש להם תת-סטטוס מלפני שהביקורת הופעלה — נופלים למועד הקשר האחרון,
-- שהוא הקירוב הטוב ביותר הקיים. עדיף מ-NULL שנקרא "מעולם לא".
UPDATE public.leads
SET sub_status_at = COALESCE(last_contact_at, handled_at)
WHERE sub_status IS NOT NULL
  AND sub_status_at IS NULL
  AND COALESCE(last_contact_at, handled_at) IS NOT NULL;
