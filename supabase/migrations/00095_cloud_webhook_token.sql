-- ============================================================
-- 00095: כתובת webhook ייחודית לכל מספר בערוץ הרשמי
--
-- 00093/00094 פתחו את צד השליחה לערוץ הרשמי. זו הצד השני: קליטה.
--
-- ב-GreenAPI כל המספרים חולקים כתובת אחת (/api/whatsapp) ואותו טוקן
-- מהסביבה (GREEN_API_WEBHOOK_TOKEN), וזיהוי המספר נעשה לפי idInstance
-- שבגוף הבקשה. מטא לא שולחת מזהה כזה בגוף שאפשר לסמוך עליו לניתוב,
-- ולכן המספר מזוהה לפי הטוקן שבכתובת עצמה: /api/whatsapp/cloud/<token>.
--
-- לכל שורה טוקן משלה, גם ל-GreenAPI. אחיד יותר, וזה מאפשר לשלול
-- גישה למספר אחד בלי לגעת באחרים — מה שטוקן גלובלי אחד לא מאפשר.
--
-- אותו טוקן משמש גם כ-Verify Token של מטא בלחיצת היד הראשונה. זו
-- אינה שכבת האבטחה האמיתית: היא חתימת X-Hub-Signature-256 שנבדקת
-- מול META_APP_SECRET בכל בקשה. הטוקן רק מנתב.
-- ============================================================

ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS webhook_token TEXT NOT NULL DEFAULT gen_random_uuid()::text;

-- ייחודיות היא תנאי לניתוב: שני מספרים עם אותו טוקן = הודעות שנכנסות
-- לחשבון הלא נכון. עדיף שההקמה תיכשל מאשר שההודעה תיפול בשקט למקום אחר.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_accounts_webhook_token_key
  ON whatsapp_accounts (webhook_token);

COMMENT ON COLUMN whatsapp_accounts.webhook_token IS
  'מזהה את המספר בכתובת ה-webhook הנכנס, ומשמש גם כ-Verify Token של מטא. האבטחה עצמה היא חתימת X-Hub-Signature-256';
