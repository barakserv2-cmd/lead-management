# פרטיות ואבטחת מידע — מה מיושם במערכת

מסמך עבודה לתמיכה בעמידה בחוק הגנת הפרטיות (תיקון 13) ותקנות אבטחת מידע 2017 (רמה בינונית).
זה לא ייעוץ משפטי — זה תיאור של מה הקוד עושה, כדי שמסמך הגדרות המאגר ונוהל האבטחה יוכלו להפנות אליו.

## 1. תיעוד גישה (תקנה 10) — `audit_log`

מיגרציה: `supabase/migrations/00045_privacy_audit_and_retention.sql`
קוד: `src/lib/audit.ts` (`logAudit`, `diffFields`, `currentActor`)

טבלה append-only. RLS: משתמש מחובר יכול לקרוא ולהוסיף בלבד; אין UPDATE/DELETE (רק service role, דרך `purge_audit_log`).
`lead_id` ללא FK בכוונה — רשומת הלוג שורדת מחיקת הליד.

| פעולה | איפה נרשם |
|---|---|
| `view` — צפייה בכרטיס מועמד | `src/app/(dashboard)/leads/[id]/page.tsx` (דרך `after()`, לא מעכב רינדור) |
| `update` — עריכת פרטים (עם diff from→to) | `PATCH /api/leads/[id]`, `updateLeadDetails`, `updateLeadField`, `updateLeadSubStatus`, `updateLeadPreferences` |
| `status_change` — מעבר סטטוס | `src/lib/actions/changeLeadStatus.ts` (נקודת החנק היחידה) |
| `note` — שמירת הערה (רק אורך, הטקסט ב-`lead_events`) | `updateLeadNotes` |
| `create` | `POST /api/leads` |
| `merge` (שתי שורות: winner + loser) | `POST /api/leads/merge` |
| `import` / `delete` / `update` המוניים | `bulkImportLeads`, `nukeAllExtrasLeads`, `clearAllArrivalDates` |
| `export` — ייצוא מידע למועמד | `GET /api/leads/[id]/privacy` |
| `anonymize` / `delete` — מחיקה | `DELETE /api/leads/[id]/privacy`, cron retention, `anonymize_lead()` |

כל שורה: מי (`actor` = אימייל), מתי, מה, איזו רשומה, IP ו-user-agent.
תצוגה: פאנל "פרטיות ואבטחת מידע" בתחתית כרטיס המועמד (`privacy-section.tsx`) → `GET /api/leads/[id]/audit`.

**לא מתועד עדיין:** צפייה ברשימת הלידים (`/leads`) — הדף מדלג על `auth.getUser()` בכוונה למהירות. אם נדרש, להוסיף שם `logAudit({action:"list"})`.

## 2. צמצום מידע — retention אוטומטי

Cron: `/api/cron/retention` — יום ראשון 04:00 UTC (`vercel.json`), מוגן ב-`CRON_SECRET`.
מדיניות (קבועים ב-`src/lib/privacy.ts`):

| סוג רשומה | חלון | פעולה |
|---|---|---|
| ליד רגיל ללא פעילות | 24 חודש | אנונימיזציה |
| ליד שהתקבל (HIRED/STARTED) | 84 חודש (7 שנים) | אנונימיזציה |
| שורות `audit_log` | 24 חודש | מחיקה |

"פעילות אחרונה" = המאוחר מבין: יצירה, טיפול, שיוך, אירוע ביומן, הודעה, שינוי סטטוס, ראיון, תאריך התחלה (`retention_candidates()`).

**אנונימיזציה** (`anonymize_lead(uuid, actor)`): מוחקת שם/טלפון/אימייל/מיקום/גיל/ניסיון/הערות/גוף מייל מקורי/העדפות/תגיות/כל שדות ה-extracted, מוחקת `messages`, `lead_notes`, `interaction_logs`, `lead_documents` (+ הקבצים ב-storage, ע"י הקורא), `reminders`; משאירה סטטוס/מקור/תאריכים/מעסיק לצורכי סטטיסטיקה; מסמנת `leads.anonymized_at`.

בדיקה יבשה: `GET /api/cron/retention?dry_run=1` עם `Authorization: Bearer $CRON_SECRET`.

## 3. זכויות נושא המידע (עיון / מחיקה)

מכרטיס המועמד → פאנל פרטיות, או ישירות:

- **זכות עיון:** `GET /api/leads/[id]/privacy` → JSON להורדה עם הליד + כל טבלאות הבת + יומן הגישה. נרשם כ-`export`.
- **זכות מחיקה:** `DELETE /api/leads/[id]/privacy?reason=...` → אנונימיזציה (ברירת מחדל). `?mode=hard` = מחיקה מלאה של השורה (audit נשאר).

זמן תגובה חוקי לבקשת עיון: 30 יום. מומלץ לתעד את הבקשה עצמה כאירוע ביומן הליד לפני הביצוע.

## 4. תפעול

- החלת מיגרציה: `node scripts/apply-migration.mjs supabase/migrations/<file>.sql` (קורא סיסמה מ-`.env.migration`).
- מסמכים ב-storage שנשארו יתומים אחרי מחיקה מחוץ למערכת: אין ניקוי אוטומטי — לבדוק ידנית ב-bucket `lead-documents`.

## 5. הקשחות שבוצעו (2026-08-18)

- `/api/gmail` — עבר ל-service role ודורש `Bearer CRON_SECRET` (Vercel cron) **או** session של רכז/ת (כפתור הסנכרון בהגדרות). הפעלה ידנית נרשמת ב-audit כ-`import`.
- `/api/whatsapp/send-manual` — דורש session. קודם כל אחד יכול היה לשלוח וואטסאפ מהמספר העסקי.
- `/api/debug-create-lead` — נמחק (endpoint אבחון זמני שכתב לפרודקשן).
- **מיגרציה `00046_close_anon_rls.sql`** — מסירה דינמית כל policy של `anon` (ושל `public`) ב-`public` וב-`storage`, מדליקה RLS על כל הטבלאות, ונותנת baseline `authenticated` לטבלאות שנשארו בלי policy. אחרי זה ה-anon key הציבורי לא קורא כלום.
  להחלה: `node scripts/apply-migration.mjs supabase/migrations/00046_close_anon_rls.sql`
  לבדוק אחרי: `node scripts/db-query.mjs "select tablename, policyname, roles::text from pg_policies where 'anon' = any(roles)"` → אמור להחזיר `[]`.

## 6. פערים שנותרו

1. `/api/whatsapp` (webhook של GreenAPI) — אין אימות token על ה-webhook. GreenAPI תומך ב-webhook auth token; להגדיר בקונסול ולבדוק בקוד.
2. אין אכיפת תפקידים בצד השרת (`user_profiles.role` הוא רק badge). כל רכז/ת = אדמין.
3. MFA לא נאכף ב-Supabase Auth.
4. policies של `authenticated` הן עדיין `USING (true)` על הכול — צמצום per-table (למשל רק לידים "שלי") הוא שלב הבא אם ייכנסו עוד משתמשים.
5. `assigned_to`/`uploaded_by` שומרים `user.id` בעוד השאר משתמש באימייל — לא משפיע על הלוג אבל מבלבל בחקירה.
