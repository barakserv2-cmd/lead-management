-- ============================================================
-- Migration: bot phase 1 — מתג, מצב צל, סבב מספרים, ניטור חסימות
-- ============================================================

-- אילו מספרים משתתפים בסבב ההודעות הקרות של הבוט (המספר הייעודי,
-- כשיהיה). last_state — ניטור מצב ה-instance מול GreenAPI כל 5 דקות.
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS last_state TEXT;
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS state_checked_at TIMESTAMPTZ;

-- תור/יומן הודעות פתיחה: כל ליד מקבל פתיחה אחת בדיוק (UNIQUE).
-- pending = מחכה (מכסה יומית מלאה / שעות שקט על ליד ישן) — ינוסה שוב
-- בסריקת ה-Gmail הבאה או ב-cron של 5 הדקות.
CREATE TABLE IF NOT EXISTS bot_outbox (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  phone        TEXT        NOT NULL,
  source       TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  via_instance TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bot_outbox_status ON bot_outbox (status, created_at);
CREATE INDEX IF NOT EXISTS idx_bot_outbox_instance_day ON bot_outbox (via_instance, sent_at);

-- מצב צל: מה הבוט *היה* שולח — בלי לשלוח ובלי לגעת בליד.
CREATE TABLE IF NOT EXISTS bot_shadow_replies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  trigger_type    TEXT        NOT NULL DEFAULT 'welcome' CHECK (trigger_type IN ('welcome', 'reply')),
  incoming_text   TEXT,
  proposed_reply  TEXT        NOT NULL,
  action          TEXT,
  human_reason    TEXT,
  screening_score INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bot_shadow_lead ON bot_shadow_replies (lead_id);
CREATE INDEX IF NOT EXISTS idx_bot_shadow_created ON bot_shadow_replies (created_at DESC);

ALTER TABLE bot_outbox         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_shadow_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_bot_outbox"
  ON bot_outbox FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_bot_shadow_replies"
  ON bot_shadow_replies FOR ALL TO authenticated USING (true) WITH CHECK (true);
