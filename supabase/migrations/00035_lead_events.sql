-- ============================================================
-- Migration: lead_events — יומן אירועים לכל מועמד
-- Description: תיעוד append-only של אירועים על עובד/מועמד
--              (שיחות, אזהרות, תיאומים, תלונות, שיבוצים) עם
--              מחבר וחותמת זמן — כדי שמחלוקות ייסגרו על תיעוד.
--              אין UPDATE/DELETE בכוונה: יומן ראיות לא עורכים.
-- ============================================================

CREATE TABLE lead_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type TEXT        NOT NULL DEFAULT 'אחר',
  event_text TEXT        NOT NULL,
  created_by TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_events_lead_id    ON lead_events (lead_id);
CREATE INDEX idx_lead_events_created_at ON lead_events (created_at DESC);

ALTER TABLE lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_lead_events"
  ON lead_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_lead_events"
  ON lead_events FOR INSERT TO authenticated WITH CHECK (true);

-- אין policies ל-UPDATE/DELETE — היומן חסין שכתוב מצד הלקוח.
