-- ============================================================
-- 00094: סגנון אימות לערוץ הרשמי — מטא ישירות מול ספק
--
-- 00093 הניחה שכל ערוץ רשמי נראה כמו מטא: טוקן ב-Authorization: Bearer
-- ונתיב שכולל את מזהה המספר. זה נכון לחיבור ישיר (כמו של גובגט), אבל
-- לא ל-360dialog: הם מאמתים בכותרת D360-API-KEY, והנתיב הוא /messages
-- בלבד — מפתח ה-API עצמו מזהה את המספר.
--
-- בלי ההבחנה הזו כל שליחה דרך הספק הייתה מוחזרת כלא-מורשית. העמודה
-- מפורשת ולא נגזרת מהכתובת, כדי שלא תהיה קסם סמוי בקוד.
-- ============================================================

ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS auth_style TEXT NOT NULL DEFAULT 'bearer';

ALTER TABLE whatsapp_accounts
  DROP CONSTRAINT IF EXISTS whatsapp_accounts_auth_style_check;
ALTER TABLE whatsapp_accounts
  ADD CONSTRAINT whatsapp_accounts_auth_style_check
  CHECK (auth_style IN ('bearer', 'd360'));

-- מזהה המספר נדרש רק בחיבור ישיר למטא, שם הוא חלק מהנתיב. אצל ספק
-- שמזהה את המספר לפי המפתח הוא מיותר, ודרישה שלו הייתה חוסמת הקמה.
ALTER TABLE whatsapp_accounts
  DROP CONSTRAINT IF EXISTS whatsapp_accounts_cloud_fields_check;
ALTER TABLE whatsapp_accounts
  ADD CONSTRAINT whatsapp_accounts_cloud_fields_check
  CHECK (
    provider <> 'cloud'
    OR (
      token_env IS NOT NULL
      AND (auth_style <> 'bearer' OR phone_number_id IS NOT NULL)
    )
  );

COMMENT ON COLUMN whatsapp_accounts.auth_style IS
  'bearer = מטא ישירות (Authorization: Bearer, נתיב עם מזהה המספר); d360 = 360dialog (D360-API-KEY, נתיב /messages)';
