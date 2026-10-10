# לידים מטפסי Meta ישירות ל-V1

נוסף לפיילוט הפייסבוק הפנימי (אוקטובר 2026). עד עכשיו לידים מפייסבוק הגיעו רק
כמייל, בלי מזהה מודעה ובלי תשובות הטופס. הנתיב הזה קולט את הליד עם הקמפיין,
המודעה ותשובות הסינון, כדי שאפשר יהיה למדוד איזו מודעה מביאה מועמדים רלוונטיים.

## הזרימה

טופס לידים ב-Meta → תרחיש ב-Make ("Facebook Lead Ads – Watch Leads") →
`POST /api/leads/meta` → ליד חדש ב-V1 → גובגט והודעת פתיחה, כמו ליד ממייל.

| תוצאה | מתי | מה קורה |
|---|---|---|
| `created` | טלפון חדש | כרטיס חדש, ערוץ "פייסבוק ממומן", שיטה "טופס", קמפיין ומודעה |
| `duplicate` | אותו `leadgen_id` כבר נקלט | כלום. Make יכול לנסות שוב בלי לשכפל |
| `repeat` | הטלפון כבר קיים | פנייה חוזרת על הכרטיס הקיים (`record_repeat_inquiry`) |

תשובה 200 לכל שלושת המקרים. 400 לבקשה שגויה (בלי מזהה או טלפון), 401 למפתח
שגוי, 500 לכשל DB, כדי ש-Make ינסה שוב.

## התקנה

1. להחיל את `supabase/migrations/00105_meta_lead_ads.sql`
   (`node scripts/dryrun-migration.mjs` ואז `apply-migration.mjs`).
2. להגדיר ב-Vercel את `META_LEAD_INGEST_KEY`: מחרוזת אקראית ארוכה
   (`openssl rand -hex 32`). בלי המשתנה הנתיב מחזיר 401 לכל בקשה.
3. ב-Make: מודול Facebook Lead Ads "Watch Leads" על העמוד והטופס, ואחריו
   HTTP "Make a request":
   - `POST https://lead-management-umber.vercel.app/api/leads/meta`
   - כותרות: `content-type: application/json`, `x-meta-lead-key: <המפתח>`
   - גוף: `leadgen_id`, `created_time`, `form_id`, `campaign_id`,
     `campaign_name`, `adset_id`, `ad_id`, `ad_name`, `field_data`
     (כמו ש-Meta מחזירה).
   - לסמן "Parse response" ולהגדיר ניסיון חוזר רק על 5xx.
4. ליד בדיקה: כלי בדיקת הלידים של Meta
   (developers.facebook.com/tools/lead-ads-testing) ואז לבדוק את הכרטיס ב-V1.

## שאלות הטופס

המפתחות (שדה "key" בשאלה מותאמת) חייבים להתאים ל-`SCREENING_KEYS` ב-`src/lib/metaLead.ts`:

| מפתח | שאלה | עובר כש |
|---|---|---|
| `role` | איזה תפקיד מעניין אותך? | לא נבדק |
| `over_18` | בן/בת 18 ומעלה? | "כן" |
| `weekends` | יכול/ה לעבוד בסופי שבוע? | "כן" |
| `availability` | לכמה זמן זמין/ה? | לא "פחות מחודש" |
| `arrival` | מתי תוכל/י להגיע לאילת? | "השבוע" |
| `eilat_ok` | העבודה באילת, מתאים לך? | "כן" |

`screening_passed` הוא סינון ראשוני לפי מה שהמועמד/ת ענה/תה בלבד. מי שמחליטה
אם המועמד רלוונטי היא הרכזת, בשיחה.

## פרטיות

התשובות נשמרות ב-`screening_answers` על הליד. כשהליד עובר אנונימיזציה לפי
מדיניות השמירה (`/api/cron/retention`), טריגר במיגרציה 00105 מוחק אותן. Make מעביר את
הנתונים ואינו שומר אותם מעבר להיסטוריית ההרצות שלו. כדאי לקצר אותה בהגדרות
התרחיש.
