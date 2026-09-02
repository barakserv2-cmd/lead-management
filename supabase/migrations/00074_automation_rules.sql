-- ============================================================
-- Migration: automation rules engine — מנוע החוקים (שלב 3)
-- הספר: "מתי? על מי? מה עושים?" — והמנוע רק מדבר ומסמן, אף פעם
-- לא משנה סטטוס. כל ריצה נרשמת עם occurrence_key ייחודי (פעם
-- אחת ביום פר חוק+ליד, גם אם ה-cron רץ פעמיים במקביל).
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_rules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
  trigger_type TEXT        NOT NULL CHECK (trigger_type IN
                 ('status_age', 'flag_open', 'after_interview')),
  -- פרמטרים של ה"מתי" וה"על מי": hours, max_hours, status וכו'
  params       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  action_type  TEXT        NOT NULL CHECK (action_type IN
                 ('message_candidate', 'raise_flag', 'notify_recruiter', 'notify_admin')),
  -- תבנית ההודעה ({{שם}} מוחלף בשם הפרטי)
  template     TEXT,
  sort_order   INT         NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id        UUID        NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  lead_id        UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  occurrence_key TEXT        NOT NULL UNIQUE,
  action_type    TEXT        NOT NULL,
  success        BOOLEAN     NOT NULL DEFAULT TRUE,
  detail         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_lead ON automation_runs (lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_automation_runs_rule ON automation_runs (rule_id, created_at);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_automation_rules"
  ON automation_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_automation_runs"
  ON automation_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── זריעת חוקי הפתיחה מהספר — כולם כבויים; מדליקים אחד-אחד ──
INSERT INTO automation_rules (name, description, enabled, trigger_type, params, action_type, template, sort_order)
SELECT * FROM (VALUES
  (
    'אל תשכח אף ליד חדש',
    'ליד חדש בלי שום תגובה 3 שעות — תזכורת וואטסאפ אחת. רק לידים מהימים האחרונים (לא נוגעים בערימה הישנה).',
    FALSE,
    'status_age',
    '{"status": "NEW_LEAD", "hours": 3, "max_hours": 72}'::jsonb,
    'message_candidate',
    'היי {{שם}} 😊 ראיתי שעוד לא הספקנו לדבר — עדיין מתעניין/ת בעבודה באילת עם מגורים? אני כאן כשנוח לך.',
    10
  ),
  (
    'אף דגל לא נשאר לבד — תזכורת לרכזת',
    'דגל "צריך בן אדם" פתוח שעתיים בשעות העבודה — תזכורת לרכזת שהדגל שלה.',
    FALSE,
    'flag_open',
    '{"hours": 2}'::jsonb,
    'notify_recruiter',
    'תזכורת: {{שם}} מחכה לך מאז {{שעה}} (דגל מהבוט). כדאי לחזור אליו/ה 🙏',
    20
  ),
  (
    'אף דגל לא נשאר לבד — הסלמה לסער',
    'דגל פתוח 4 שעות ואף אחת לא טיפלה — התראה לסער.',
    FALSE,
    'flag_open',
    '{"hours": 4}'::jsonb,
    'notify_admin',
    '⚠️ {{שם}} מחכה לרכזת מאז {{שעה}} (מוקצה ל-{{רכזת}}) — אף אחת לא טיפלה.',
    30
  ),
  (
    'אחרי ראיון תמיד יש המשך',
    'עבר יום מהראיון והסטטוס לא עודכן — תזכורת לרכזת לעדכן מה קרה.',
    FALSE,
    'after_interview',
    '{"hours": 24}'::jsonb,
    'notify_recruiter',
    'מה קרה בראיון של {{שם}} ({{שעה}})? הסטטוס עדיין "ראיון נקבע" — עדכני את הכרטיס 🙏',
    40
  )
) AS seed(name, description, enabled, trigger_type, params, action_type, template, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM automation_rules);
