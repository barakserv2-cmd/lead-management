// מיפוי UTM לגורם גיוס ממומן. מודול קטן ונפרד כדי שנתיבים ציבוריים
// (הטופס של האתר החדש) ישתמשו באותם כללים בלי לטעון את googleapis.

// ── פירוק לפי UTM מגוף המייל ─────────────────────────────────────
// טפסי האתר מדווחים utm_source/utm_medium בגוף המייל (למשל
// "utm_source: google utm_medium: cpc"). כשליד מהאתר הגיע מקמפיין
// ממומן — מתייגים לפי הקמפיין במקום לפי הטופס. בלי UTM = אורגני.
const UTM_RULES: { source: RegExp; medium?: RegExp; label: string }[] = [
  { source: /google/i, medium: /cpc|ppc|paid/i, label: "גוגל ממומן" },
  { source: /facebook|^fb$|meta/i, label: "פייסבוק" },
  { source: /instagram|^ig$/i, label: "אינסטגרם" },
  { source: /tiktok/i, label: "טיקטוק" },
];

/** שולף utm_source/utm_medium מגוף המייל (תומך גם בקידומת cf- של Elementor). */
export function extractUtm(body: string): { source: string | null; medium: string | null } {
  const source = body.match(/(?:cf-)?utm_source:\s*([^\s]+)/i)?.[1] ?? null;
  const medium = body.match(/(?:cf-)?utm_medium:\s*([^\s]+)/i)?.[1] ?? null;
  // ערך שהוא בעצם השדה הבא (למשל "utm_source: utm_medium: ...") = ריק
  const clean = (v: string | null) => (v && !/^(cf-)?utm_/i.test(v) ? v : null);
  return { source: clean(source), medium: clean(medium) };
}

/** ממפה UTM לגורם גיוס ממומן, או null אם אין התאמה (=אורגני). */
export function detectSourceFromUtm(body: string): string | null {
  const utm = extractUtm(body);
  if (!utm.source) return null;
  for (const rule of UTM_RULES) {
    if (!rule.source.test(utm.source)) continue;
    if (rule.medium && !(utm.medium && rule.medium.test(utm.medium))) continue;
    return rule.label;
  }
  return null;
}
