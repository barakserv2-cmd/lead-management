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
import { LeadStatus } from "@/lib/stateMachine";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** אחוז מתוך הנכנסים */
  pct: number;
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

export interface AnalyticsResult {
  totalLeads: number;
  funnel: FunnelStage[];
  sources: SourceStats[];
  recruiters: RecruiterStats[];
  /** חציון שעות מיצירת הליד עד הפעולה הראשונה עליו */
  medianFirstTouchHours: number | null;
}

const FUNNEL_STAGES: { key: string; label: string; statuses: string[] }[] = [
  { key: "contacted", label: "נוצר קשר", statuses: [LeadStatus.CONTACTED] },
  { key: "screening", label: "בסינון", statuses: [LeadStatus.SCREENING_IN_PROGRESS] },
  { key: "fit", label: "מתאים לראיון", statuses: [LeadStatus.FIT_FOR_INTERVIEW] },
  { key: "interview", label: "ראיון נקבע", statuses: [LeadStatus.INTERVIEW_BOOKED] },
  { key: "arrived", label: "הגיע לראיון", statuses: [LeadStatus.ARRIVED] },
  { key: "hired", label: "התקבל", statuses: [LeadStatus.HIRED, LeadStatus.STARTED] },
];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function computeAnalytics(
  db: SupabaseClient,
  fromIso: string,
  toIso: string
): Promise<AnalyticsResult> {
  // 1. קוהורטת הלידים שנוצרו בטווח
  const { data: leads } = await db
    .from("leads")
    .select("id, source, created_at")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .limit(10000);

  const leadList = leads ?? [];
  const leadIds = new Set(leadList.map((l) => l.id as string));
  const leadCreated = new Map(leadList.map((l) => [l.id as string, l.created_at as string]));
  const leadSource = new Map(
    leadList.map((l) => [l.id as string, ((l.source as string) || "אחר").trim()])
  );

  // 2. כל מעברי הסטטוס מאז תחילת הטווח (ליד לא זז לפני שנוצר, אז זה
  //    מכסה את כל ההיסטוריה של הקוהורטה, כולל התקדמות אחרי סוף הטווח)
  const { data: history } = await db
    .from("lead_status_history")
    .select("lead_id, to_status, changed_by, changed_at")
    .gte("changed_at", fromIso)
    .order("changed_at", { ascending: true })
    .limit(50000);

  const reached = new Map<string, Set<string>>(); // lead → statuses ever reached
  const firstTouch = new Map<string, string>(); // lead → first transition time
  const recruiterMap = new Map<string, RecruiterStats>();

  for (const h of history ?? []) {
    const leadId = h.lead_id as string;
    if (!leadIds.has(leadId)) continue;
    const status = h.to_status as string;
    (reached.get(leadId) ?? reached.set(leadId, new Set()).get(leadId)!).add(status);
    if (!firstTouch.has(leadId)) firstTouch.set(leadId, h.changed_at as string);

    const by = String(h.changed_by ?? "");
    if (by.includes("@")) {
      const r =
        recruiterMap.get(by) ?? { email: by, actions: 0, interviews: 0, hires: 0 };
      r.actions++;
      if (status === LeadStatus.INTERVIEW_BOOKED) r.interviews++;
      if (status === LeadStatus.HIRED) r.hires++;
      recruiterMap.set(by, r);
    }
  }

  // 3. המשפך
  const total = leadList.length;
  const funnel: FunnelStage[] = [
    { key: "entered", label: "נכנסו", count: total, pct: 100 },
    ...FUNNEL_STAGES.map((stage) => {
      let count = 0;
      for (const statuses of reached.values()) {
        if (stage.statuses.some((s) => statuses.has(s))) count++;
      }
      return {
        key: stage.key,
        label: stage.label,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    }),
  ];

  // 4. פירוק פר-מקור
  const sourceMap = new Map<string, SourceStats>();
  for (const [leadId, source] of leadSource) {
    const s =
      sourceMap.get(source) ?? { source, leads: 0, contacted: 0, interviews: 0, hires: 0 };
    s.leads++;
    const statuses = reached.get(leadId);
    if (statuses) {
      if (statuses.size > 0) s.contacted++;
      if (statuses.has(LeadStatus.INTERVIEW_BOOKED)) s.interviews++;
      if (statuses.has(LeadStatus.HIRED) || statuses.has(LeadStatus.STARTED)) s.hires++;
    }
    sourceMap.set(source, s);
  }

  // 5. זמן עד פעולה ראשונה (חציון שעות)
  const hoursToFirst: number[] = [];
  for (const [leadId, t] of firstTouch) {
    const created = leadCreated.get(leadId);
    if (!created) continue;
    const h = (new Date(t).getTime() - new Date(created).getTime()) / 3600_000;
    if (h >= 0 && h < 24 * 30) hoursToFirst.push(h);
  }

  return {
    totalLeads: total,
    funnel,
    sources: Array.from(sourceMap.values()).sort((a, b) => b.leads - a.leads),
    recruiters: Array.from(recruiterMap.values()).sort((a, b) => b.hires - a.hires || b.actions - a.actions),
    medianFirstTouchHours: median(hoursToFirst),
  };
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
