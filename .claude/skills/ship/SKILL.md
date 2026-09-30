---
name: ship
description: Deploy the v1 CRM (lead-management) to production safely. Use for any request to deploy, ship, release, push live, "תעלה לאוויר", "תפרוס", or after finishing a code change that needs to reach production. Runs typecheck with its own exit code, tests, a real Next build, brings the checkout up to date with main, pushes to main on GitHub (Vercel deploys main automatically — never `vercel --prod`), and verifies the production deployment of that exact commit is Ready.
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

**3. פרודקשן עולה רק דרך GitHub. לעולם לא `vercel --prod`.**

Vercel מחובר ל-GitHub ופורס את `main` לפרודקשן לבד, תוך דקה מכל דחיפה או
מיזוג. זו הדרך היחידה להעלות לאוויר.

`vercel --prod` מעלה את **מה שיש בתיקייה המקומית**, לא את main. תקלה שחזרה
על עצמה (28–29/09): פריסות CLI מעותק מקומי ישן החזירו את הפרודקשן לעיצוב
הקודם שוב ושוב, אחרי ששינויים כבר מוזגו ל-main ונפרסו. פריסות כאלה גם לא
נרשמות ב-GitHub, ולכן אף אחד לא ראה מאיפה הן באות. כשהכל עובר דרך main —
הפרודקשן תמיד שווה ל-main, ואין דרך להעלות גרסה ישנה בטעות.

גם ה-build עצמו אוכף את זה: `scripts/guard-production-build.mjs` רץ לפני
`next build` בכל build של פרודקשן, שואל את GitHub אם הקומיט מכיל את כל main,
ומפיל את ה-build אם לא (או אם הקומיט בכלל לא נדחף). האתר החי לא מתחלף.

אסור גם `vercel deploy --prod`, `vercel promote` או "Redeploy" על פריסה של
ענף. אם צריך לשחזר — Promote בלוח של Vercel **רק** לפריסה של הקומיט האחרון
ב-main.

## הרצף

```bash
cd "C:/Users/Barak/Projects/lead-management"

# 0. להתעדכן ב-main לפני הכל — עבודה על עותק ישן היא בדיוק התקלה
git fetch origin main
git merge origin/main || { echo "STOP: קונפליקט מול main — לפתור ורק אז להמשיך"; exit 1; }

# 1. בדיקות — כל אחת עם קוד היציאה שלה
npx tsc --noEmit > /tmp/tsc.txt 2>&1; RC=$?; echo "tsc=$RC"; [ $RC -ne 0 ] && head -20 /tmp/tsc.txt
npx vitest run
npx next build > /tmp/b.txt 2>&1; echo "build=$?"; grep -iE "Failed to compile|Error:" /tmp/b.txt | head -5

# 2. קומיט ודחיפה ל-main — זו הפריסה. Vercel לוקח משם.
git add -A && git commit -m "..."
git push origin HEAD:main || { echo "STOP: הדחיפה ל-main נכשלה (מישהו דחף בינתיים?) — git pull origin main ושוב מההתחלה"; exit 1; }
SHA=$(git rev-parse HEAD)

# 3. לחכות שהפריסה של הקומיט הזה תהיה Ready (סטטוס "Vercel" על הקומיט ב-GitHub)
for i in $(seq 1 60); do
  ST=$(curl -s "https://api.github.com/repos/barakserv2-cmd/lead-management/commits/$SHA/status" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const s=(JSON.parse(d).statuses||[]).find(x=>x.context==="Vercel");console.log(s?s.state:"none")})')
  [ "$ST" = success ] && { echo "Production Ready: $SHA"; break; }
  [ "$ST" = failure ] || [ "$ST" = error ] && { echo "STOP: הפריסה נכשלה — לבדוק בלוח של Vercel"; exit 1; }
  sleep 10
done
```

אם העבודה נעשית בענף (PR): לא פורסים מהענף. ממזגים את ה-PR ל-main, ו-Vercel
פורס את main לבד. אחרי המיזוג — אותה בדיקה של שלב 3 על קומיט המיזוג.

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
