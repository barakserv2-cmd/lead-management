# Lead Management — ברק שירותים

מערכת ניהול המועמדים הפנימית של ברק שירותים (חברת העסקה וגיוס, אילת).
קולטת לידים מכל ערוץ, מנהלת את הפייפליין, מפעילה וואטסאפ פר-רכזת, לוח משרות
ומעסיקים, פרסום לקבוצות פייסבוק, חתימה דיגיטלית, פרטיות לפי תיקון 13 ודוחות.
הסוכן האוטונומי (גובגט, `../recruitment-machine`) עובד לצידה דרך bridge.

פרודקשן: `lead-management-umber.vercel.app` (Vercel `fra1`, Supabase `eu-central-1`).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 + shadcn · Supabase
(Postgres + Auth + RLS) · GreenAPI (WhatsApp) · Anthropic (עוזר AI + ניסוח) ·
Vercel Cron.

## פיתוח

```bash
npm install
cp .env.example .env.local   # ראו רשימת משתנים למטה
npm run dev
```

| פקודה | מה |
|---|---|
| `npm run dev` | שרת פיתוח |
| `npm run build` | build לפרודקשן |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (מכונת המצבים ועוד) |

## מבנה

```
src/app/(dashboard)/   מסכי הרכזות: today, leads, interviews, jobs, clients,
                       publishing, reports, channels, autonomy, survey, settings
src/app/api/           API routes — כל route מאמת בעצמו (getAuthedUser /
                       requireAdmin / CRON_SECRET / MACHINE_BRIDGE_KEY)
src/app/api/bridge/    from-machine, lead-check, lead-summary — הצד שלנו ב-bridge לגובגט
src/app/sign/[token]   חתימה דיגיטלית ציבורית
src/app/book/[token]   קביעת ראיון עצמית
src/lib/stateMachine.ts   מפת המעברים + guardrails — כל שינוי סטטוס עובר כאן
src/lib/actions/changeLeadStatus.ts   נתיב הכתיבה היחיד לסטטוס
src/lib/gmail.ts       סורק Gmail + SOURCE_RULES (תיוג מקור)
src/lib/whatsappService.ts, messageVisibility.ts   וואטסאפ פר-רכזת
src/lib/publishing.ts  פרסום לקבוצות פייסבוק (קודי BK)
src/lib/privacy.ts, audit.ts   תיקון 13: יומן ביקורת, DSAR, שמירה
supabase/migrations/   סכמה — ראו README בתיקייה
scripts/               כלי תחזוקה חד-פעמיים (db-query, apply-migration, backfills)
```

## מכונת המצבים

15 סטטוסים. המפה ב-`src/lib/stateMachine.ts` נבנתה מנתוני אמת ואוכפת:
"התחיל לעבוד" רק אחרי "התקבל", "סיום העסקה" רק למי שהתקבל, "לא הגיע" רק
כשהיה ראיון, "הגיע לראיון" רק אחרי ראיון שנקבע, ואין נסיגה של מועסק לפייפליין.
גובגט (actor `machine`) רשאית לפעול רק בתוך שלבי הטרום-ראיון ולעולם לא מקבלת,
דוחה או פותחת סגירה של רכזת. הבדיקות ב-`src/lib/stateMachine.test.ts`.

## אוטומציה (vercel.json)

| cron | תדירות | תפקיד |
|---|---|---|
| `/api/gmail` | כל 2 דק' | סריקת מיילים → לידים |
| `/api/cron/sync-new-leads` | כל דקה | דחיפת לידים חדשים לגובגט |
| `/api/cron/scheduled` | כל 5 דק' | הודעות מתוזמנות + מנוע חוקים |
| `/api/cron/sync-jobs` | כל שעתיים | משרות פתוחות לגובגט |
| `/api/cron/daily` | כל שעה | תזכורות ראיון (חלון 16:30–22:00) |
| `/api/cron/feedback-digest` | יומי | סיכום משוב |
| `/api/cron/retention` | שבועי | אנונימיזציה ומחיקה לפי מדיניות |

## משתני סביבה

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY`, `CRON_SECRET`, `GREEN_API_*` (מספר עסקי משותף),
`MACHINE_BRIDGE_KEY` + `MACHINE_INGEST_URL` (bridge לגובגט), `FINANCE_EMAILS`,
Gmail OAuth (`GOOGLE_CLIENT_ID/SECRET`). מיגרציות: `FRANKFURT_DB_PASSWORD_REAL` ב-`.env.migration`.

## ידוע

- Server actions של Next 16 לטפסי POST לא יציבים — להעדיף `fetch` + API route.
- `interview_date` נשמר כשעון קיר ישראלי עם תווית UTC; לקרוא רק דרך שדות UTC.
- טלפון ייחודי לכל מועמד (טריגר נרמול + UNIQUE); לצפות ל-23505 ולהציע מיזוג.
