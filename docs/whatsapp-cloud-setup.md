# חיבור מספר לערוץ הרשמי של מטא

שני מסלולים, ואותו קוד משרת את שניהם. ההבדל היחיד הוא מי מאמת את
ה-webhook הנכנס — ראו `authorize()` ב-`src/app/api/whatsapp/cloud/[token]/route.ts`.

| | דרך ספק (360dialog) | ישירות מול מטא |
|---|---|---|
| `provider` | `cloud` | `cloud` |
| `auth_style` | `d360` | `bearer` |
| `api_base` | `https://waba-v2.360dialog.io` | ריק (graph.facebook.com) |
| `phone_number_id` | לא נדרש | חובה |
| אימות נכנס | `Authorization: Bearer <webhook_secret>` | `X-Hub-Signature-256` מול `META_APP_SECRET` |
| הטלפון של הרכז/ת | ממשיך לעבוד (Coexistence) | **מתנתק** |

## למה צריך ספק כדי לשמר את הטלפון

Coexistence הוא מה שמאפשר למספר לחיות גם באפליקציה וגם ב-API. מטא פותחת
אותו רק דרך Embedded Signup, ורק ל-Solution Partner או Tech Provider.
מעמד Tech Provider אינו רישום עצמי — הוא דורש App Review עם סרטוני הדגמה
ואישור ידני, והוא בנוי עבור מי שמוכר שירות ללקוחות. לכן למספר של רכז/ת
המסלול הישיר אינו רלוונטי: הוא ינתק את המספר מהטלפון.

## סדר הפעולות

1. **פריסה לאוויר.** הכתובת חייבת להיות חיה לפני שאפשר להפנות אליה ספק:
   `npx vercel --prod` (לא git — ראו מנגנון הפריסה).
2. **משתני סביבה ב-Vercel** — `META_APP_SECRET` נדרש רק למסלול הישיר.
   במסלול הספק האימות הוא בסוד שבטבלה, ואין צורך בו.
3. **שורה בטבלה.** `webhook_token` ו-`webhook_secret` נוצרים לבד (ברירת מחדל uuid):

```sql
INSERT INTO whatsapp_accounts
  (user_email, instance_id, api_token, phone, label, is_active,
   provider, auth_style, api_base, token_env)
VALUES
  ('tami@eilatjobs.com', 'cloud:<phone_number_id>', '', '972544324726',
   'תמי — ערוץ רשמי', true,
   'cloud', 'd360', 'https://waba-v2.360dialog.io', 'WHATSAPP_CLOUD_TOKEN_TAMI');
```

הטוקן עצמו לא נשמר בדאטהבייס — רק שם משתנה הסביבה שמחזיק אותו.

4. **קביעת ה-webhook אצל 360dialog.** הסוד עובר בכותרת, לא בכתובת:

```
POST https://waba-v2.360dialog.io/v1/configs/webhook
D360-API-KEY: <api key>

{
  "url": "https://crm.eilatjobs.com/api/whatsapp/cloud/<webhook_token>",
  "headers": { "Authorization": "Bearer <webhook_secret>" }
}
```

מגבלה של מטא: הדומיין ב-URL אינו יכול להכיל `_` או פורט (`:3000`).

5. **מעבר בפועל** — עדכון `provider` בשורה של הרכז/ת. כל 18 מסלולי השליחה
   עוברים ב-`sendWhatsAppMessage`, ולכן זו שורה אחת ולא שינוי קוד.

## גלגול לאחור

להחזיר `provider` ל-`greenapi` באותה שורה. הערוץ הישן לא נגע ולא הוסר.

## מה שעדיין לא נבנה

- **שליחת תבניות.** מחוץ לחלון 24 השעות `sendViaCloud` נכשל בכוונה עם הסבר
  לרכז/ת, במקום לשלוח משהו שבור. כ-62% מהתנועה היוצאת נמצאת שם.
- **`smb_message_echoes`** — הקוד קיים אך לא אומת מול echo אמיתי.
- **מסך החיבור** ב-`/settings/whatsapp` עדיין מציג QR של GreenAPI.
