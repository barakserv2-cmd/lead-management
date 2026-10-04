-- 00103: a recruiter can be limited to her own conversations.
--
-- Saar, 04.10: "מלי רואה את התכתבויות של כולם — אני רוצה שהיא תראה רק את שלה".
-- A recruiter with a linked WhatsApp number sees her own number's chats plus
-- every "house" conversation (via_instance IS NULL: גובגט, automated messages,
-- legacy rows) — for Mali that was ~1,400 candidate messages in two weeks from
-- leads that aren't hers, each one a chat pop-up, next to ~380 on her number.
--
-- sees_shared_chats = false keeps her to her own number, plus house
-- conversations on leads she handles (so taking over a lead from גובגט still
-- shows what was said). Default true: nobody else changes. Admins and
-- recruiters without a number are unaffected.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS sees_shared_chats boolean NOT NULL DEFAULT true;

UPDATE public.user_profiles
   SET sees_shared_chats = false
 WHERE lower(email) = 'barakserv@eilatjobs.com';
