-- ============================================================
-- 00105: לידים מטפסי לידים של Meta, ישירות (פיילוט פייסבוק פנימי, 6.10)
--
-- עד היום לידים מפייסבוק הגיעו רק כמייל ("new lead from facebook"), בלי
-- מזהה מודעה ובלי תשובות הטופס, ולכן אי אפשר היה לדעת איזו מודעה מביאה
-- מועמדים רלוונטיים. /api/leads/meta קולט את הליד כמו ש-Meta שולחת אותו
-- (דרך Make) ושומר את המזהים כאן.
--
-- meta_lead_id ייחודי: אותו ליד שנשלח פעמיים (ניסיון חוזר של Make) לא
-- יוצר כרטיס שני.
-- screening_passed הוא סינון ראשוני לפי תשובות המועמד בלבד. "מועמד
-- רלוונטי" נקבע ע"י רכזת, לא כאן.
-- ============================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_lead_id      TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_form_id      TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_campaign_id  TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_adset_id     TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_ad_id        TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_ad_name      TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS screening_answers JSONB;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS screening_passed  BOOLEAN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_meta_lead_id
  ON public.leads (meta_lead_id)
  WHERE meta_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_meta_ad
  ON public.leads (meta_ad_id, created_at DESC)
  WHERE meta_ad_id IS NOT NULL;

-- פרטיות: anonymize_lead() (00045) לא מכירה את screening_answers. במקום
-- להגדיר אותה מחדש, טריגר מוחק את התשובות ברגע שהליד עובר אנונימיזציה.
-- screening_passed ומזהי המודעה נשארים: הם שלד סטטיסטי, לא מידע אישי.
CREATE OR REPLACE FUNCTION public.clear_screening_on_anonymize()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN
    NEW.screening_answers := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_screening_on_anonymize ON public.leads;
CREATE TRIGGER trg_clear_screening_on_anonymize
  BEFORE UPDATE OF anonymized_at ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.clear_screening_on_anonymize();
