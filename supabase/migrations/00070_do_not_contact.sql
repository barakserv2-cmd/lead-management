-- 00070: opt-out flag — בקשת הסרה מדיוור (שלב 2 בתוכנית העבודה)
--
-- כל שליחת וואטסאפ (ידנית, אוטומטית, cron, בוט) עוברת דרך שער שליחה אחד
-- (src/lib/sendGate.ts) שבודק את הדגל הזה. הדלקה: זיהוי דטרמיניסטי של
-- "תסירו אותי" ב-webhook, או ידנית בפאנל הפרטיות בכרטיס המועמד.

alter table leads add column if not exists do_not_contact boolean not null default false;

comment on column leads.do_not_contact is
  'המועמד/ת ביקש/ה לא לקבל הודעות — כל שליחת וואטסאפ נחסמת בשער השליחה (sendGate)';
