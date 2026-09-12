---
name: ship
description: Deploy the v1 CRM (lead-management) to production safely. Use for any request to deploy, ship, release, push live, "תעלה לאוויר", "תפרוס", or after finishing a code change that needs to reach production. Runs typecheck with its own exit code, tests, a real Next build, commits, deploys via the Vercel CLI, and verifies the deployment is actually Ready.
---

# Ship — פריסת מערכת גיוס לפרודקשן

## הכללים שאסור לשבור

**1. לעולם אל תעביר `tsc` בצינור.**

```bash
npx tsc --noEmit > /tmp/tsc.txt 2>&1; RC=$?; echo "tsc=$RC"
```

`npx tsc --noEmit | head && echo ok` מדווח על קוד היציאה של `head`.
בגלל זה קומיט שבור עלה לאוויר והפרודקשן נשאר על גרסה ישנה בשקט.

**2. להריץ `next build` לפני הפריסה.**

`tsc` לבד לא תופס הכל. שגיאה אמיתית שקרתה: קובץ שרת (`next/headers`) נמשך
בטעות לתוך קומפוננטת לקוח. `tsc` עבר, ה-build נפל.

```bash
npx next build > /tmp/b.txt 2>&1; echo "build=$?"
```

**3. פורסים ב-CLI, לא ב-git push.**

## הרצף

```bash
cd "C:/Users/Barak/Projects/lead-management"

npx tsc --noEmit > /tmp/tsc.txt 2>&1; RC=$?; echo "tsc=$RC"; [ $RC -ne 0 ] && head -20 /tmp/tsc.txt
npx vitest run
npx next build > /tmp/b.txt 2>&1; echo "build=$?"; grep -iE "Failed to compile|Error:" /tmp/b.txt | head -5

git add -A && git commit -m "..."
npx vercel --prod --yes
npx vercel ls        # השורה הראשונה חייבת להיות ● Ready · Production
```

## מיגרציות

DDL מגיע **רק** דרך קובץ מיגרציה — לא ידנית בקונסולה.

```bash
node scripts/apply-migration.mjs supabase/migrations/000NN_name.sql
```

הסקריפט צריך `FRANKFURT_DB_PASSWORD_REAL` ב-`.env.migration`. אין RPC בשם
`exec_sql` בפרויקט הזה — אל תנסה.

## מלכודות שכבר עלו

- **`Intl` וקומפוננטות לקוח**: `interview_date` נשמר כשעון קיר ישראלי עם
  תווית UTC. לקרוא ולפרמט **רק** בשדות `getUTC*`, לעולם לא
  `timeZone: "Asia/Jerusalem"` על ערך שנקרא מהדאטהבייס. גבולות יום נבנים
  עם `Z`, לא עם `+03:00`.
- **Server actions בטפסים**: Next 16 מפיל אותם. להעדיף `fetch` + API route.
- **ייבוא קוד שרת לקליינט**: כל דבר שנוגע ב-`getSupabaseAdmin` או
  `next/headers` לא יכול להיות מיובא מקומפוננטת לקוח, גם לא בעקיפין דרך
  קובץ עזר משותף.

## אימות אחרי פריסה

לא להסתפק ב-`Ready`. אם השינוי משנה התנהגות — להריץ שאילתה על הדאטהבייס
ולראות שהיא מחזירה את מה שציפית. **ואם אי אפשר לראות את המסך** (אין גישה
לחשבון של רכזת) — לומר את זה במפורש במקום להניח שזה נראה תקין.

## מסר הקומיט

להסביר **למה**, לא **מה**. אם השינוי נולד מתקלה — לתעד אותה: מי דיווח,
מה נשבר, כמה פעמים. לסיים ב:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
