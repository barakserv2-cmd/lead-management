-- ============================================================
-- Migration: מיקומי שדות על גבי המסמך
-- Description: field_positions — מערך משבצות [{key,page,x,y,w,h}]
--              בקואורדינטות מנורמלות (0-1, y מלמעלה). כשקיים,
--              הערכים שהמועמד מילא (והחתימה) מוטבעים על הקווים
--              בתוך הטופס במקום עמודי נספח. ממופה ע"י כלי
--              הסימון (mapper) ונשמר על התבנית; מועתק לבקשה
--              בזמן שליחה כמו required_fields.
-- ============================================================

ALTER TABLE signature_templates
  ADD COLUMN IF NOT EXISTS field_positions JSONB;

ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS field_positions JSONB;
