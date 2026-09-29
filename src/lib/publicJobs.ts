// ── המשרות שמוצגות באתר הציבורי ──────────────────────────────
// ב-V1 כל מעסיק מקבל שורה משלו, ולכן אותו תפקיד מופיע כמה פעמים
// ("אקסטרה חגים" ממלונות שונים, "מלצר" ו"מלצרים"). באתר מאחדים לפי
// שם התפקיד המנורמל, מציגים כמה משרות יש וטווח שכר בין כולן. קיצורים
// ורבים/יחיד מתורגמים לשם אחד שמועמד מבין. בלי שם מעסיק.

export interface JobRow {
  title: string;
  location: string | null;
  pay_rate: string | null;
  requirements: string[] | null;
  urgent: boolean | null;
  client_type: string | null;
}

export interface PublicJob {
  title: string;
  location: string;
  /** "40" או "38-45"; null כשאין שכר מספרי באף אחת מהמשרות */
  pay: string | null;
  /** לפחות אחת מהמשרות רשומה עם תוספת ("45+2", "40+") */
  payBonus: boolean;
  requirements: string[];
  urgent: boolean;
  sector: string | null;
  count: number;
}

const SECTOR: Record<string, string> = {
  Hotel: "מלונאות",
  Hotels: "מלונאות",
  Restaurant: "מסעדנות",
  Construction: "בנייה",
};

// שמות שהרכזות כותבים בכמה צורות → שם אחד לאתר. הסדר חשוב: הראשון שמתאים.
const TITLE_FIXES: [RegExp, string][] = [
  [/^(ע\.\s*טבח|עוזרי? טבח(ים)?)$/, "עוזר/ת טבח"],
  [/^(ש\.\s*כלים|שוטפי? כלים|שטיפת כלים)$/, "שוטף/ת כלים"],
  [/^(מלצר|מלצרים|מלצרית|מלצריות)$/, "מלצר/ית"],
  [/^(פקיד|פקידת|פקידי|פקידות) קבלה$/, "פקיד/ת קבלה"],
  [/^(צ'?קר|צ'?קרים|צ'?קרית|צ'?קריות)$/, "צ'קר/ית"],
  [/^(ברמן|ברמנים|ברמנית|ברמניות)$/, "ברמן/ית"],
  [/^(טבח|טבחים|טבחית)$/, "טבח/ית"],
  [/^(קונדיטור|קונדיטורים|קונדיטורית)$/, "קונדיטור/ית"],
  [/^(ראנר|ראנרים|ראנרית)$/, "ראנר/ית"],
  [/^(ניקיון )?שטחים ציבורי(ים|ם)$/, "ניקיון שטחים ציבוריים"],
];

export function publicTitle(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  for (const [re, full] of TITLE_FIXES) if (re.test(t)) return full;
  return t;
}

/** מפרק שכר כמו "40", "37-40", "45+2", "40+". טקסט חופשי ("תלוי") → null. */
export function parsePay(raw: string | null): { min: number; max: number; bonus: boolean } | null {
  const s = (raw ?? "").replace(/\s/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?(\+(?:\d+(?:\.\d+)?)?)?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return { min: Math.min(a, b), max: Math.max(a, b), bonus: !!m[3] };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

/** ממיר שורות משרה מ-V1 לרשימה לאתר: מאוחדת לפי תפקיד, עם טווח שכר, דחופות קודם. */
export function toPublicJobs(rows: JobRow[], limit = 60): PublicJob[] {
  type Acc = PublicJob & { min: number; max: number };
  const byTitle = new Map<string, Acc>();

  for (const r of rows) {
    if (!r.title?.trim()) continue;
    const title = publicTitle(r.title);
    const pay = parsePay(r.pay_rate);
    let j = byTitle.get(title);
    if (!j) {
      j = {
        title,
        location: r.location?.trim() || "אילת",
        pay: null,
        payBonus: false,
        requirements: [],
        urgent: false,
        sector: null,
        count: 0,
        min: Infinity,
        max: -Infinity,
      };
      byTitle.set(title, j);
    }
    j.count += 1;
    j.urgent ||= !!r.urgent;
    j.sector ??= r.client_type ? SECTOR[r.client_type] ?? null : null;
    for (const req of r.requirements ?? []) {
      if (req && !j.requirements.includes(req) && j.requirements.length < 4) j.requirements.push(req);
    }
    if (pay) {
      j.min = Math.min(j.min, pay.min);
      j.max = Math.max(j.max, pay.max);
      j.payBonus ||= pay.bonus;
    }
  }

  const list: PublicJob[] = [...byTitle.values()].map(({ min, max, ...j }) => ({
    ...j,
    pay: Number.isFinite(min) ? (min === max ? fmt(min) : `${fmt(min)}-${fmt(max)}`) : null,
  }));
  // סדר המקור (דחוף ואז חדש) נשמר לפי ההופעה הראשונה של כל תפקיד
  return [...list.filter((j) => j.urgent), ...list.filter((j) => !j.urgent)].slice(0, limit);
}
