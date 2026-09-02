-- ============================================================
-- Migration: post-placement care — ליווי אחרי השמה + תקופת אחריות (שלב 6)
-- ============================================================

-- ימי אחריות פר-מלון (NULL = ברירת המחדל מ-finance_settings)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS guarantee_days INT
  CHECK (guarantee_days IS NULL OR (guarantee_days >= 0 AND guarantee_days <= 365));

-- ברירת מחדל כלל-מערכתית לימי האחריות
ALTER TABLE finance_settings ADD COLUMN IF NOT EXISTS default_guarantee_days INT NOT NULL DEFAULT 30;

-- ה-check-ins וההתראות משתמשים ב-cron_reminders הקיימת (occurrence_key
-- ייחודי פר ליד+אירוע) — אין צורך בטבלה חדשה.
