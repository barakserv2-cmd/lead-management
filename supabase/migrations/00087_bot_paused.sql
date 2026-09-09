-- 00087: "is Gubget frozen for this lead?" — one explicit flag the CRM owns.
-- Set true when Gubget escalates (it freezes itself) and kept true on "קח
-- שליטה"; cleared only by an explicit "אפשר לגובגט להמשיך" / "החזר לגובגט".
-- Drives the lead card: hides the "גובגט מטפלת" banner while paused and shows
-- the hand-back button — so a taken-over lead never falsely reads as bot-owned.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bot_paused boolean NOT NULL DEFAULT false;

-- leads currently awaiting a human are frozen on the machine side already
UPDATE public.leads SET bot_paused = true WHERE needs_human_attention = true AND bot_paused = false;
