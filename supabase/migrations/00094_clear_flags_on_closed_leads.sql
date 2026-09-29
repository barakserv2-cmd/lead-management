-- 00094: ניקוי חד-פעמי של דגלי "דורש תשומת לב" שנשארו על לידים סגורים.
-- מעכשיו changeLeadStatus מכבה את הדגל בסגירה; זה מנקה את מה שנצבר לפני כן
-- (255 דגלים ב-29/09). רק דגל שנדלק לפני הסגירה או במועדה — דגל שנדלק
-- אחריה (בעיקר "פנייה חוזרת" של מועמד שנסגר והגיש שוב) הוא אות חדש ונשאר.
-- הסיבה הישנה נשמרת ביומן האירועים לפני הכיבוי. אידמפוטנטי: ריצה חוזרת
-- לא מוצאת כלום.

WITH targets AS (
  SELECT l.id, l.status, l.attention_reason
  FROM public.leads l
  WHERE l.needs_attention
    AND l.status IN ('REJECTED','NOT_SUITABLE','LOST_CONTACT','INVALID_PHONE',
                     'NOT_ACCEPTED','NO_SHOW','CANCELLED_ARRIVAL','EMPLOYMENT_ENDED')
    AND (
      l.needs_attention_at IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.lead_status_history h
        WHERE h.lead_id = l.id AND h.to_status = l.status
      )
      OR l.needs_attention_at <= (
        SELECT max(h.changed_at) FROM public.lead_status_history h
        WHERE h.lead_id = l.id AND h.to_status = l.status
      )
    )
),
journal AS (
  INSERT INTO public.lead_events (lead_id, event_type, event_text, created_by)
  SELECT id, 'דגל נוקה',
         'ניקוי חד-פעמי (00094): הליד סגור (' || status || ') — הדגל כובה. הסיבה שהייתה: '
           || coalesce(nullif(attention_reason, ''), 'ללא סיבה'),
         'מערכת'
  FROM targets
  RETURNING lead_id
)
UPDATE public.leads l
SET needs_attention = false, needs_attention_at = NULL, attention_reason = NULL
FROM targets t
WHERE l.id = t.id;
