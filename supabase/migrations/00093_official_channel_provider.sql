-- ============================================================
-- 00093: ערוץ רשמי לצד GreenAPI — תמיכה בשני ספקים בטבלת החשבונות
--
-- הרקע: המספרים של תמי וחושן נותקו מ-GreenAPI (14.09), והמספר של
-- חושן אף הופיע כחסום. GreenAPI הוא לקוח לא רשמי של ווטסאפ, ולכן
-- כל חיבור מחדש הוא הימור. המעבר הוא ל-coexistence של מטא: אותו
-- מספר, אותה אפליקציה בטלפון, רק דרך API מורשה.
--
-- הטבלה עד היום הניחה ספק אחד: instance_id + api_token של GreenAPI.
-- כאן היא נפתחת לשני ספקים, בלי לגעת באף שורה קיימת — ברירת המחדל
-- היא 'greenapi', כך שהמספר של מלי (היחיד שמחובר כרגע) ממשיך כרגיל.
--
-- instance_id נשאר המפתח הייחודי שמזהה חשבון בכל המערכת (ניתוב
-- הודעות נכנסות, הרשאות צפייה ב-messageVisibility). לשורה של ערוץ
-- רשמי הוא מקבל ערך סינתטי "cloud:<phone_number_id>", כדי שלא יידרש
-- שינוי בכל מקום שמסתמך עליו.
-- ============================================================

ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'greenapi';

-- מזהה המספר אצל מטא (לא המספר עצמו) — הכתובת שאליה שולחים.
ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS phone_number_id TEXT;

-- בסיס ה-API. ריק = מטא ישירות. ספק (360dialog וכד') חושף API תואם
-- בכתובת משלו, ולכן הוא נתון ולא קבוע בקוד.
ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS api_base TEXT;

-- שם משתנה הסביבה שמחזיק את הטוקן. הטוקן עצמו לא נשמר בדאטהבייס:
-- ב-GreenAPI הוא כבר יושב ב-api_token מהיסטוריה, אבל טוקן של מטא
-- הוא קבוע ומאפשר שליחה בשם העסק — הוא נשאר בסביבה בלבד.
ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS token_env TEXT;

ALTER TABLE whatsapp_accounts
  DROP CONSTRAINT IF EXISTS whatsapp_accounts_provider_check;
ALTER TABLE whatsapp_accounts
  ADD CONSTRAINT whatsapp_accounts_provider_check
  CHECK (provider IN ('greenapi', 'cloud'));

-- שורת ערוץ רשמי חייבת לדעת לאן לשלוח ובאיזה טוקן.
ALTER TABLE whatsapp_accounts
  DROP CONSTRAINT IF EXISTS whatsapp_accounts_cloud_fields_check;
ALTER TABLE whatsapp_accounts
  ADD CONSTRAINT whatsapp_accounts_cloud_fields_check
  CHECK (
    provider <> 'cloud'
    OR (phone_number_id IS NOT NULL AND token_env IS NOT NULL)
  );

COMMENT ON COLUMN whatsapp_accounts.provider IS
  'greenapi = לקוח לא רשמי (מדור קודם); cloud = הערוץ הרשמי של מטא';
COMMENT ON COLUMN whatsapp_accounts.phone_number_id IS
  'Phone Number ID אצל מטא — המזהה שאליו שולחים, לא המספר עצמו';
COMMENT ON COLUMN whatsapp_accounts.api_base IS
  'בסיס ה-API; ריק = graph.facebook.com. ספק חושף API תואם בכתובת משלו';
COMMENT ON COLUMN whatsapp_accounts.token_env IS
  'שם משתנה הסביבה שמחזיק את הטוקן — הטוקן עצמו לא יושב בדאטהבייס';
