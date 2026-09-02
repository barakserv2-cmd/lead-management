// ── שער הגישה לנתונים הכספיים ──────────────────────────────
// ה-ROI הכספי (עלויות ערוצים, דמי השמה, תשואה) גלוי רק לכתובות
// שברשימה — ברירת מחדל סער בלבד. האכיפה בצד השרת: גם בדף וגם ב-API.

export function financeEmails(): string[] {
  const raw = (process.env.FINANCE_EMAILS ?? "saar@eilatjobs.com").trim();
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isFinanceUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return financeEmails().includes(email.toLowerCase());
}
