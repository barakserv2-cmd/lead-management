// ============================================================
// Analytics — שכבת החישוב של שלב 5
// ============================================================
//
// הכל מחושב ממה שכבר נרשם: lead_status_history (כל מעבר, עם מי
// ומתי), תיוג המקור על הליד, וההשמות. אפס איסוף חדש.
//
// מתודולוגיית המשפך: קוהורטה — לוקחים את הלידים *שנוצרו* בטווח,
// ובודקים לכל אחד לאילו שלבים הוא הגיע אי-פעם (גם אם אחרי סוף
// הטווח). ככה "כמה מהלידים של אוגוסט הפכו להשמות" נשאר נכון גם
// כשההשמה קרתה בספטמבר.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LeadStatus } from "./stateMachine";

export interface FunnelStage {
  key: string;
  label: string;
  /** לידים מהקוהורטה שהגיעו לשלב הזה או לשלב מאוחר ממנו */
  count: number;
  /** אחוז מתוך הנכנסים */
  pct: number;
  /** אחוז המעבר מהשלב הקודם (null בשלב הראשון) */
  stepPct: number | null;
}

export interface SourceStats {
  source: string;
  leads: number;
  contacted: number;
  interviews: number;
  hires: number;
}

export interface RecruiterStats {
  email: string;
  actions: number;
  interviews: number;
  hires: number;
}

/** לידים מהקוהורטה שסטטוס הנוכחי שלהם סגור — למה ובאיזה שלב נשרו */
export interface ExitStats {
  status: string;
  count: number;
  /** כמה מהם הגיעו לפחות לראיון לפני שנסגרו */
  afterInterview: number;
}

/** לידים מהקוהורטה שעדיין פתוחים, לפי השלב שבו הם עומדים עכשיו */
export interface OpenStats {
  key: string;
  label: string;
  count: number;
}

export interface AnalyticsResult {
  totalLeads: number;
  funnel: FunnelStage[];
  sources: SourceStats[];
  recruiters: RecruiterStats[];
  /** חציון שעות מיצירת הליד עד הפעולה הראשונה עליו */
  medianFirstTouchHours: number | null;
  /** חציון ימים מכניסת הליד עד שנקבע לו ראיון */
  medianDaysToInterview: number | null;
  /** חציון ימים מכניסת הליד עד שהתקבל */
  medianDaysToHire: number | null;
  exits: ExitStats[];
  open: OpenStats[];
  /** החישוב נחתך בתקרת שליפה — המספרים חלקיים */
  truncated: boolean;
}

// המשפך מצטבר: כל סטטוס ממופה לשלב הרחוק ביותר שהוא מעיד עליו, וליד נספר
// בכל שלב עד השלב המקסימלי שהגיע אליו. ליד שקפץ מ"ממתין" ישר ל"ראיון נקבע"
// נספר גם ב"נוצר קשר" — אחרת שלב מאוחר יוצא גדול משלב מוקדם, והנשירה שלילית.
const FUNNEL_STAGES: { key: string; label: string }[] = [
  { key: "contacted", label: "נוצר קשר" },
  { key: "screening", label: "בסינון" },
  { key: "fit", label: "מתאים לראיון" },
  { key: "interview", label: "ראיון נקבע" },
  { key: "arrived", label: "הגיע לראיון" },
  { key: "hired", label: "התקבל" },
];

/** השלב (1..6) שסטטוס מעיד עליו; 0 = לא מקדם במשפך (ממתין / נסגר לפני ראיון) */
export const STAGE_OF_STATUS: Record<string, number> = {
  [LeadStatus.CONTACTED]: 1,
  [LeadStatus.SCREENING_IN_PROGRESS]: 2,
  [LeadStatus.FIT_FOR_INTERVIEW]: 3,
  [LeadStatus.INTERVIEW_BOOKED]: 4,
  [LeadStatus.POSTPONED_ARRIVAL]: 4, // ראיון נקבע ונדחה
  [LeadStatus.NO_SHOW]: 4, // ראיון נקבע, לא הגיע
  [LeadStatus.CANCELLED_ARRIVAL]: 4, // ראיון נקבע, ביטל
  [LeadStatus.ARRIVED]: 5,
  [LeadStatus.NOT_ACCEPTED]: 5, // נפסל אחרי ראיון — כלומר הגיע
  [LeadStatus.HIRED]: 6,
  [LeadStatus.STARTED]: 6,
  [LeadStatus.EMPLOYMENT_ENDED]: 6,
};

const CLOSED = new Set<string>([
  LeadStatus.NO_SHOW,
  LeadStatus.CANCELLED_ARRIVAL,
  LeadStatus.NOT_ACCEPTED,
  LeadStatus.REJECTED,
  LeadStatus.LOST_CONTACT,
  LeadStatus.NOT_SUITABLE,
  LeadStatus.INVALID_PHONE,
]);

// איפה עומד ליד פתוח עכשיו (לפי הסטטוס הנוכחי שלו)
const OPEN_BUCKETS: { key: string; label: string; statuses: string[] }[] = [
  { key: "waiting", label: "ממתינים לנציג", statuses: [LeadStatus.NEW_LEAD] },
  {
    key: "working",
    label: "בטיפול לפני ראיון",
    statuses: [LeadStatus.CONTACTED, LeadStatus.SCREENING_IN_PROGRESS, LeadStatus.FIT_FOR_INTERVIEW],
  },
  {
    key: "interview",
    label: "בשלב ראיון",
    statuses: [LeadStatus.INTERVIEW_BOOKED, LeadStatus.POSTPONED_ARRIVAL, LeadStatus.ARRIVED],
  },
];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface CohortLead {
  id: string;
  source: string | null;
  created_at: string;
  status: string;
}

export interface HistoryRow {
  lead_id: string;
  to_status: string;
  changed_by: string | null;
  changed_at: string;
}

const DAY = 86_400_000;

/**
 * החישוב עצמו — פונקציה טהורה על הקוהורטה והיסטוריית המעברים, כדי שאפשר
 * לבדוק אותה בלי מסד נתונים. `history` חייב להיות ממוין לפי זמן עולה.
 */
export function analyzeCohort(
  leadList: CohortLead[],
  history: HistoryRow[],
  truncated = false
): AnalyticsResult {
  const leadIds = new Set(leadList.map((l) => l.id));
  const leadCreated = new Map(leadList.map((l) => [l.id, l.created_at]));

  const maxStage = new Map<string, number>(); // lead → השלב הרחוק ביותר
  const touched = new Set<string>(); // לידים שזזו לפחות פעם אחת
  const firstTouch = new Map<string, string>();
  const firstInterview = new Map<string, string>();
  const firstHire = new Map<string, string>();
  const recruiterMap = new Map<string, RecruiterStats>();

  for (const h of history) {
    const leadId = h.lead_id;
    if (!leadIds.has(leadId)) continue;
    const status = h.to_status;
    const stage = STAGE_OF_STATUS[status] ?? 0;
    touched.add(leadId);
    if (stage > (maxStage.get(leadId) ?? 0)) maxStage.set(leadId, stage);
    if (!firstTouch.has(leadId)) firstTouch.set(leadId, h.changed_at);
    if (stage >= 4 && !firstInterview.has(leadId)) firstInterview.set(leadId, h.changed_at);
    if (stage >= 6 && !firstHire.has(leadId)) firstHire.set(leadId, h.changed_at);

    const by = String(h.changed_by ?? "");
    if (by.includes("@")) {
      const r = recruiterMap.get(by) ?? { email: by, actions: 0, interviews: 0, hires: 0 };
      r.actions++;
      if (status === LeadStatus.INTERVIEW_BOOKED) r.interviews++;
      if (status === LeadStatus.HIRED) r.hires++;
      recruiterMap.set(by, r);
    }
  }

  // הסטטוס הנוכחי מעיד גם הוא על שלב — למקרה שהמעבר נרשם לפני תחילת הטווח
  // או לא נרשם בהיסטוריה בכלל
  for (const l of leadList) {
    const stage = STAGE_OF_STATUS[l.status] ?? 0;
    if (stage > (maxStage.get(l.id) ?? 0)) maxStage.set(l.id, stage);
  }

  const total = leadList.length;
  const counts = FUNNEL_STAGES.map((_, i) => {
    let c = 0;
    for (const m of maxStage.values()) if (m >= i + 1) c++;
    return c;
  });
  const funnel: FunnelStage[] = [
    { key: "entered", label: "נכנסו", count: total, pct: 100, stepPct: null },
    ...FUNNEL_STAGES.map((stage, i) => {
      const prev = i === 0 ? total : counts[i - 1];
      return {
        key: stage.key,
        label: stage.label,
        count: counts[i],
        pct: total > 0 ? Math.round((counts[i] / total) * 100) : 0,
        stepPct: prev > 0 ? Math.round((counts[i] / prev) * 100) : null,
      };
    }),
  ];

  // פירוק פר-מקור
  const sourceMap = new Map<string, SourceStats>();
  for (const l of leadList) {
    const source = (l.source || "אחר").trim() || "אחר";
    const s = sourceMap.get(source) ?? { source, leads: 0, contacted: 0, interviews: 0, hires: 0 };
    s.leads++;
    const m = maxStage.get(l.id) ?? 0;
    if (touched.has(l.id) || m > 0) s.contacted++;
    if (m >= 4) s.interviews++;
    if (m >= 6) s.hires++;
    sourceMap.set(source, s);
  }

  // נשירה ולידים פתוחים — לפי הסטטוס הנוכחי
  const exitMap = new Map<string, ExitStats>();
  const openCounts = new Map<string, number>();
  for (const l of leadList) {
    if (CLOSED.has(l.status)) {
      const e = exitMap.get(l.status) ?? { status: l.status, count: 0, afterInterview: 0 };
      e.count++;
      if ((maxStage.get(l.id) ?? 0) >= 4) e.afterInterview++;
      exitMap.set(l.status, e);
    } else {
      const bucket = OPEN_BUCKETS.find((b) => b.statuses.includes(l.status));
      if (bucket) openCounts.set(bucket.key, (openCounts.get(bucket.key) ?? 0) + 1);
    }
  }

  const since = (m: Map<string, string>, unit: number) => {
    const out: number[] = [];
    for (const [leadId, t] of m) {
      const created = leadCreated.get(leadId);
      if (!created) continue;
      const d = (new Date(t).getTime() - new Date(created).getTime()) / unit;
      if (d >= 0 && d < 365) out.push(d);
    }
    return median(out);
  };

  return {
    totalLeads: total,
    funnel,
    sources: Array.from(sourceMap.values()).sort((a, b) => b.leads - a.leads),
    recruiters: Array.from(recruiterMap.values()).sort((a, b) => b.hires - a.hires || b.actions - a.actions),
    medianFirstTouchHours: (() => {
      const hs: number[] = [];
      for (const [leadId, t] of firstTouch) {
        const created = leadCreated.get(leadId);
        if (!created) continue;
        const h = (new Date(t).getTime() - new Date(created).getTime()) / 3600_000;
        if (h >= 0 && h < 24 * 30) hs.push(h);
      }
      return median(hs);
    })(),
    medianDaysToInterview: since(firstInterview, DAY),
    medianDaysToHire: since(firstHire, DAY),
    exits: Array.from(exitMap.values()).sort((a, b) => b.count - a.count),
    open: OPEN_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: openCounts.get(b.key) ?? 0 })),
    truncated,
  };
}

const LEAD_CAP = 10000;
const HISTORY_CAP = 50000;

export async function computeAnalytics(
  db: SupabaseClient,
  fromIso: string,
  toIso: string
): Promise<AnalyticsResult> {
  // 1. קוהורטת הלידים שנכנסו בטווח — לפי זמן ההגעה האמיתי (effective_at:
  //    תאריך המייל כשיש, אחרת created_at), כמו בעמוד הלידים
  const { data: leads } = await db
    .from("leads")
    .select("id, source, created_at, status")
    .gte("effective_at", fromIso)
    .lte("effective_at", toIso)
    .limit(LEAD_CAP);

  // 2. כל מעברי הסטטוס מאז תחילת הטווח (ליד לא זז לפני שנוצר, אז זה
  //    מכסה את כל ההיסטוריה של הקוהורטה, כולל התקדמות אחרי סוף הטווח)
  const { data: history } = await db
    .from("lead_status_history")
    .select("lead_id, to_status, changed_by, changed_at")
    .gte("changed_at", fromIso)
    .order("changed_at", { ascending: true })
    .limit(HISTORY_CAP);

  const leadList = (leads ?? []) as CohortLead[];
  const rows = (history ?? []) as HistoryRow[];
  return analyzeCohort(leadList, rows, leadList.length >= LEAD_CAP || rows.length >= HISTORY_CAP);
}

// ── הרובד הכספי (סער בלבד — ראו lib/finance.ts) ─────────────

export interface SourceFinance extends SourceStats {
  spend: number;
  costPerLead: number | null;
  costPerHire: number | null;
  revenue: number;
  roi: number | null; // תשואה: (הכנסה - הוצאה) / הוצאה
}

export interface FinanceResult {
  fee: number;
  guaranteeDays: number;
  months: string[]; // YYYY-MM-01 בטווח
  costs: { source: string; month: string; amount: number }[];
  bySource: SourceFinance[];
  totals: { spend: number; revenue: number; hires: number };
}

function monthsBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const d = new Date(fromIso.slice(0, 7) + "-01T00:00:00Z");
  const end = new Date(toIso.slice(0, 7) + "-01T00:00:00Z");
  while (d <= end && out.length < 24) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

export async function computeFinance(
  db: SupabaseClient,
  fromIso: string,
  toIso: string,
  sources: SourceStats[]
): Promise<FinanceResult> {
  const months = monthsBetween(fromIso, toIso);
  const [{ data: costRows }, { data: settings }] = await Promise.all([
    db
      .from("channel_costs")
      .select("source, month, amount")
      .in("month", months),
    db
      .from("finance_settings")
      .select("default_placement_fee, default_guarantee_days")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const fee = Number(settings?.default_placement_fee ?? 0);
  const guaranteeDays = Number(settings?.default_guarantee_days ?? 30);
  const spendBySource = new Map<string, number>();
  for (const c of costRows ?? []) {
    const k = String(c.source);
    spendBySource.set(k, (spendBySource.get(k) ?? 0) + Number(c.amount));
  }

  const bySource: SourceFinance[] = sources.map((s) => {
    const spend = spendBySource.get(s.source) ?? 0;
    const revenue = s.hires * fee;
    return {
      ...s,
      spend,
      costPerLead: spend > 0 && s.leads > 0 ? spend / s.leads : null,
      costPerHire: spend > 0 && s.hires > 0 ? spend / s.hires : null,
      revenue,
      roi: spend > 0 ? (revenue - spend) / spend : null,
    };
  });

  const totals = bySource.reduce(
    (acc, s) => ({
      spend: acc.spend + s.spend,
      revenue: acc.revenue + s.revenue,
      hires: acc.hires + s.hires,
    }),
    { spend: 0, revenue: 0, hires: 0 }
  );

  return {
    fee,
    guaranteeDays,
    months,
    costs: (costRows ?? []).map((c) => ({
      source: String(c.source),
      month: String(c.month),
      amount: Number(c.amount),
    })),
    bySource,
    totals,
  };
}
