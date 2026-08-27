-- 00068: "מתי דיברנו איתו לאחרונה" על הליד עצמו.
--
-- לא היה שדה כזה. handled_at מתעדכן רק בשינוי סטטוס, ודווקא הזרימה שבה זה
-- הכי חשוב — "אין מענה 1 → 2 → 3" — היא שינוי תת-סטטוס בלבד, שלא נגע בשום
-- חותמת זמן. התוצאה: אי אפשר היה לדעת מתי ניסו להתקשר בפעם האחרונה.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;

-- "מי הכי מזמן לא דיברנו איתו" — המיון שהלוח עושה
CREATE INDEX IF NOT EXISTS idx_leads_last_contact
  ON public.leads (last_contact_at DESC NULLS LAST);

-- ── Backfill ────────────────────────────────────────────────
-- מה שהיה אפשר לשחזר: הטיפול האחרון, ההודעה היוצאת האחרונה, ושינוי הסטטוס
-- האחרון. interaction_logs נבדק ונמצא ריק (0 שורות) ולכן לא נכלל.
UPDATE public.leads l
SET last_contact_at = GREATEST(
  l.handled_at,
  (SELECT max(m.created_at) FROM public.messages m
    WHERE m.lead_id = l.id AND m.role IN ('recruiter', 'assistant')),
  (SELECT max(h.changed_at) FROM public.lead_status_history h
    WHERE h.lead_id = l.id AND h.changed_by LIKE '%@%')
)
WHERE l.last_contact_at IS NULL;

-- ── Keep it current on every outgoing message ───────────────
-- טריגר ולא קוד אפליקציה: הודעות יוצאות נשלחות מהרבה נתיבים (ידני, קרון,
-- מתוזמנות, חתימות, סוכן AI), וטריגר תופס גם נתיבים שייכתבו בעתיד.
CREATE OR REPLACE FUNCTION public.touch_lead_last_contact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IN ('recruiter', 'assistant') THEN
    UPDATE public.leads
    SET last_contact_at = GREATEST(COALESCE(last_contact_at, NEW.created_at), NEW.created_at)
    WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_lead_last_contact ON public.messages;
CREATE TRIGGER trg_touch_lead_last_contact
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_last_contact();
