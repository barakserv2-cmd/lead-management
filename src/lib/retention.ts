// ============================================================
// Retention — כמה זמן עובדים נשארים (דוח "שימור")
// ============================================================
//
// הביקוש (כ-150 עובדים בכל רגע) ≈ גיוסים בחודש × חודשי העסקה ממוצעים.
// לכן חודש העסקה נוסף בממוצע שווה כמו 50% יותר גיוסים — והדוח הזה מודד
// בדיוק את זה: מי עדיין עובד, כמה נשארו 30/60/90/180 יום, כמה חודשי עבודה
// הביא כל ערוץ, ולמה עוזבים.
//
// תקופת העסקה ("spell") נגזרת מהליד עצמו:
//   התחלה = start_date, או from_start_date המוקדם ב-job_transfers — מעבר בין
//           מעסיקים דורס את start_date, ומעבר פנימי הוא בדיוק מה שאנחנו רוצים
//           לספור כהמשך העסקה ולא כעזיבה.
//   סיום  = employment_end_date כשהסטטוס "סיום העסקה"; אחרת העובד פעיל.
// מגבלה ידועה: גיוס חוזר של אותו מועמד למעסיק אחר נרשם ב-job_transfers כמו
// מעבר, ולכן שתי תקופות נפרדות מתחברות לאחת.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LeadStatus } from "./stateMachine";
import { EMPLOYMENT_END_REASONS, employmentEndReasonLabel, candidateSegmentLabel } from "./constants";

export const SURVIVAL_DAYS = [30, 60, 90, 180] as const;
export type SurvivalDay = (typeof SURVIVAL_DAYS)[number];

/** חלון הקוהורט: מי שהתחיל לעבוד ב-12 החודשים האחרונים. */
export const COHORT_DAYS = 365;
const DAYS_PER_MONTH = 30.44;

export interface RetentionLead {
  id: string;
  source: string | null;
  status: string;
  start_date: string | null;
  employment_end_date: string | null;
  employment_end_reason: string | null;
  hired_client: string | null;
  candidate_segment?: string | null;
  comes_with_friend?: boolean | null;
}

/** שלושה מצבים של "מגיע עם חבר" — גם "לא סומן" מוצג, כדי שיראו כמה חסר. */
export function friendGroupLabel(v: boolean | null | undefined): string {
  if (v == null) return "לא סומן";
  return v ? "עם חבר" : "לבד";
}

export interface TransferStart {
  lead_id: string;
  from_start_date: string | null;
}

export interface SurvivalCell {
  /** התחילו לפני N ימים לפחות — רק להם אפשר לדעת אם החזיקו N ימים */
  eligible: number;
  survived: number;
  rate: number | null;
}

export interface RetentionGroup {
  key: string;
  started: number;
  active: number;
  left: number;
  /** סכום ימי העבודה בקוהורט, בחודשים */
  workerMonths: number;
  /** חציון ימי העסקה בקרב מי שעזב */
  medianDaysLeft: number | null;
  survival: Record<SurvivalDay, SurvivalCell>;
}

export interface ReasonCount {
  code: string | null;
  label: string;
  planned: boolean;
  count: number;
}

export interface MonthFlow {
  month: string; // YYYY-MM
  started: number;
  left: number;
}

export interface RetentionReport {
  today: string;
  cohortFrom: string;
  /** עובדים פעילים כרגע (לא רק מהקוהורט) */
  activeNow: number;
  totals: RetentionGroup;
  bySource: RetentionGroup[];
  byClient: RetentionGroup[];
  bySegment: RetentionGroup[];
  byFriend: RetentionGroup[];
  /** סיבות עזיבה בקוהורט, כולל "לא צוין" */
  reasons: ReasonCount[];
  /** התקבלו ותאריך ההתחלה עוד לפניהם */
  upcoming: number;
  /** נסגרו כ"לא התחיל לעבוד בפועל" — לא נספרים כתקופת העסקה */
  neverStarted: number;
  /** בלי תאריך התחלה או סיום — לא ניתן לחשב */
  undated: number;
  months: MonthFlow[];
}

interface Spell {
  source: string;
  client: string;
  segment: string;
  friend: string;
  start: string;
  end: string | null;
  reason: string | null;
}

function dayNum(date: string): number {
  return Math.round(new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime() / 86_400_000);
}

function daysBetween(from: string, to: string): number {
  return dayNum(to) - dayNum(from);
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function spellDays(s: Spell, today: string): number {
  return Math.max(0, daysBetween(s.start, s.end ?? today));
}

function summarize(key: string, spells: Spell[], today: string): RetentionGroup {
  const survival = {} as Record<SurvivalDay, SurvivalCell>;
  for (const n of SURVIVAL_DAYS) {
    const eligible = spells.filter((s) => daysBetween(s.start, today) >= n);
    const survived = eligible.filter((s) => s.end === null || spellDays(s, today) >= n).length;
    survival[n] = {
      eligible: eligible.length,
      survived,
      rate: eligible.length > 0 ? survived / eligible.length : null,
    };
  }
  const leftSpells = spells.filter((s) => s.end !== null);
  const totalDays = spells.reduce((sum, s) => sum + spellDays(s, today), 0);
  return {
    key,
    started: spells.length,
    active: spells.length - leftSpells.length,
    left: leftSpells.length,
    workerMonths: Math.round((totalDays / DAYS_PER_MONTH) * 10) / 10,
    medianDaysLeft: median(leftSpells.map((s) => spellDays(s, today))),
    survival,
  };
}

function groupBy(spells: Spell[], keyOf: (s: Spell) => string, today: string): RetentionGroup[] {
  const map = new Map<string, Spell[]>();
  for (const s of spells) {
    const k = keyOf(s);
    const list = map.get(k) ?? [];
    list.push(s);
    map.set(k, list);
  }
  return Array.from(map.entries())
    .map(([k, list]) => summarize(k, list, today))
    .sort((a, b) => b.started - a.started || a.key.localeCompare(b.key, "he"));
}

/** Pure — כל החישוב, בלי גישה לבסיס הנתונים. today בפורמט YYYY-MM-DD. */
export function analyzeRetention(
  leads: RetentionLead[],
  transfers: TransferStart[],
  today: string
): RetentionReport {
  const earliestTransfer = new Map<string, string>();
  for (const t of transfers) {
    if (!t.from_start_date) continue;
    const d = t.from_start_date.slice(0, 10);
    const cur = earliestTransfer.get(t.lead_id);
    if (!cur || d < cur) earliestTransfer.set(t.lead_id, d);
  }

  const spells: Spell[] = [];
  let upcoming = 0;
  let neverStarted = 0;
  let undated = 0;

  for (const l of leads) {
    const ended = l.status === LeadStatus.EMPLOYMENT_ENDED;
    const working = l.status === LeadStatus.HIRED || l.status === LeadStatus.STARTED;
    if (!ended && !working) continue;
    if (ended && l.employment_end_reason === "never_started") {
      neverStarted++;
      continue;
    }
    if (!l.start_date) {
      undated++;
      continue;
    }
    let start = l.start_date.slice(0, 10);
    const moved = earliestTransfer.get(l.id);
    if (moved && moved < start) start = moved;

    if (working && start > today) {
      upcoming++;
      continue;
    }
    if (ended && !l.employment_end_date) {
      undated++;
      continue;
    }
    spells.push({
      source: (l.source ?? "").trim() || "אחר",
      client: (l.hired_client ?? "").trim() || "לא ידוע",
      segment: candidateSegmentLabel(l.candidate_segment),
      friend: friendGroupLabel(l.comes_with_friend),
      start,
      end: ended ? l.employment_end_date!.slice(0, 10) : null,
      reason: ended ? l.employment_end_reason : null,
    });
  }

  const cohortFrom = shiftDays(today, -COHORT_DAYS);
  const cohort = spells.filter((s) => s.start >= cohortFrom);

  const reasonCounts = new Map<string | null, number>();
  for (const s of cohort) {
    if (s.end === null) continue;
    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
  }
  const reasons: ReasonCount[] = Array.from(reasonCounts.entries())
    .map(([code, count]) => ({
      code,
      label: employmentEndReasonLabel(code),
      planned: EMPLOYMENT_END_REASONS.find((r) => r.code === code)?.planned ?? false,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // תנועה חודשית — 6 החודשים האחרונים כולל הנוכחי, מכל התקופות (לא רק הקוהורט)
  const months: MonthFlow[] = [];
  const [y, m] = today.split("-").map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    months.push({
      month: key,
      started: spells.filter((s) => s.start.startsWith(key)).length,
      left: spells.filter((s) => s.end?.startsWith(key)).length,
    });
  }

  return {
    today,
    cohortFrom,
    activeNow: spells.filter((s) => s.end === null).length,
    totals: summarize("סה״כ", cohort, today),
    bySource: groupBy(cohort, (s) => s.source, today),
    byClient: groupBy(cohort, (s) => s.client, today),
    bySegment: groupBy(cohort, (s) => s.segment, today),
    byFriend: groupBy(cohort, (s) => s.friend, today),
    reasons,
    upcoming,
    neverStarted,
    undated,
    months,
  };
}

function israelToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

export async function computeRetention(db: SupabaseClient): Promise<RetentionReport> {
  const [{ data: leads }, { data: transfers }] = await Promise.all([
    db
      .from("leads")
      .select(
        "id, source, status, start_date, employment_end_date, employment_end_reason, hired_client, candidate_segment, comes_with_friend"
      )
      .in("status", [LeadStatus.HIRED, LeadStatus.STARTED, LeadStatus.EMPLOYMENT_ENDED])
      .limit(10000),
    db.from("job_transfers").select("lead_id, from_start_date").limit(10000),
  ]);
  return analyzeRetention(
    (leads ?? []) as RetentionLead[],
    (transfers ?? []) as TransferStart[],
    israelToday()
  );
}
