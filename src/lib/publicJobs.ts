// ── המשרות שמוצגות באתר הציבורי ──────────────────────────────
// ב-V1 כל מעסיק מקבל שורה משלו, ולכן אותה משרה מופיעה כמה פעמים
// ("אקסטרה חגים" ממלונות שונים). באתר מאחדים לפי שם + שכר ומציגים
// כמה משרות יש. קיצורים פנימיים מתורגמים לשם שמועמד מבין. בלי שם מעסיק.

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
  pay: string | null;
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

// קיצורים שהרכזות כותבות בשם המשרה → השם המלא
const TITLE_FIXES: [RegExp, string][] = [
  [/^ע\.\s*טבח/, "עוזר/ת טבח"],
  [/^ש\.\s*כלים/, "שוטף/ת כלים"],
  [/^צקרים$/, "צ'קרים"],
];

export function publicTitle(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  for (const [re, full] of TITLE_FIXES) if (re.test(t)) return t.replace(re, full);
  return t;
}

/** ממיר שורות משרה מ-V1 לרשימה לאתר: מאוחדת, בלי מעסיק, דחופות קודם. */
export function toPublicJobs(rows: JobRow[], limit = 60): PublicJob[] {
  const byKey = new Map<string, PublicJob>();
  for (const r of rows) {
    if (!r.title?.trim()) continue;
    const title = publicTitle(r.title);
    const pay = r.pay_rate?.trim() || null;
    const key = `${title}|${pay ?? ""}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.urgent ||= !!r.urgent;
      continue;
    }
    byKey.set(key, {
      title,
      location: r.location?.trim() || "אילת",
      pay,
      requirements: (r.requirements ?? []).filter(Boolean).slice(0, 4),
      urgent: !!r.urgent,
      sector: r.client_type ? SECTOR[r.client_type] ?? null : null,
      count: 1,
    });
  }
  // יציב: שומר את סדר המקור (דחוף ואז חדש) בתוך כל קבוצה
  const list = [...byKey.values()];
  return [...list.filter((j) => j.urgent), ...list.filter((j) => !j.urgent)].slice(0, limit);
}
