// ============================================================
// Arrival — מי שנקבע לו ראיון פרונטלי באילת, האם הגיע (דוח "הגעה")
// ============================================================
//
// כ-95% מהמועמדים לא מאילת, והקבלה קורית רק אחרי ראיון פרונטלי — כלומר
// המועמד נוסע על חשבונו לפני שהתקבל. כשליש ממי שאמר "מגיע" לא מגיע.
// הדוח מודד את אחוז ההגעה, ולמה לא מגיעים, לפי חבר / סוג מועמד / ערוץ.
//
// האוכלוסייה: לידים שהראיון הפרונטלי האחרון שלהם (interview_date) נפל
// ב-WINDOW_DAYS הימים האחרונים, לא כולל היום.
//   הגיע    = הסטטוס הנוכחי הוא "הגיע" ומעבר לו, או שיש מעבר כזה בהיסטוריה.
//   לא הגיע = לא הגיע, והסטטוס כבר לא "ראיון נקבע" / "דחה הגעה"
//             (כולל מי שנסגר אחר כך כ"אבד קשר", "נדחה" וכו').
//   ממתין   = עדיין "ראיון נקבע" / "דחה הגעה" — לא עודכנה תוצאה.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LeadStatus } from "./stateMachine";
import { candidateSegmentLabel, noArrivalReasonLabel } from "./constants";
import { friendGroupLabel } from "./retention";

export const WINDOW_DAYS = 90;

/** סטטוסים שמשמעותם שהמועמד הגיע לראיון באילת. */
export const ARRIVED_STATUSES: string[] = [
  LeadStatus.ARRIVED,
  LeadStatus.HIRED,
  LeadStatus.STARTED,
  LeadStatus.EMPLOYMENT_ENDED,
  LeadStatus.NOT_ACCEPTED,
];

const PENDING_STATUSES: string[] = [LeadStatus.INTERVIEW_BOOKED, LeadStatus.POSTPONED_ARRIVAL];

export interface ArrivalLead {
  id: string;
  status: string;
  source: string | null;
  interview_date: string | null;
  candidate_segment: string | null;
  comes_with_friend: boolean | null;
  no_arrival_reason: string | null;
}

export interface ArrivalGroup {
  key: string;
  booked: number;
  arrived: number;
  notArrived: number;
  pending: number;
  /** הגיעו מתוך מי שיש לו תוצאה (בלי הממתינים) */
  rate: number | null;
}

export interface ArrivalReason {
  code: string | null;
  label: string;
  count: number;
}

export interface ArrivalReport {
  windowFrom: string;
  windowTo: string;
  totals: ArrivalGroup;
  byFriend: ArrivalGroup[];
  bySegment: ArrivalGroup[];
  bySource: ArrivalGroup[];
  reasons: ArrivalReason[];
}

type Outcome = "arrived" | "not_arrived" | "pending";

interface Row {
  outcome: Outcome;
  friend: string;
  segment: string;
  source: string;
  reason: string | null;
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function summarize(key: string, rows: Row[]): ArrivalGroup {
  const arrived = rows.filter((r) => r.outcome === "arrived").length;
  const notArrived = rows.filter((r) => r.outcome === "not_arrived").length;
  const decided = arrived + notArrived;
  return {
    key,
    booked: rows.length,
    arrived,
    notArrived,
    pending: rows.length - decided,
    rate: decided > 0 ? arrived / decided : null,
  };
}

function groupBy(rows: Row[], keyOf: (r: Row) => string): ArrivalGroup[] {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);
  }
  return Array.from(map.entries())
    .map(([k, list]) => summarize(k, list))
    .sort((a, b) => b.booked - a.booked || a.key.localeCompare(b.key, "he"));
}

/**
 * Pure. leads = לידים עם ראיון פרונטלי; arrivedIds = לידים שבהיסטוריה שלהם
 * יש מעבר ל-ARRIVED_STATUSES (הסטטוס הנוכחי אולי כבר התקדם/נסגר).
 */
export function analyzeArrivals(leads: ArrivalLead[], arrivedIds: Set<string>, today: string): ArrivalReport {
  const windowFrom = shiftDays(today, -WINDOW_DAYS);
  const windowTo = shiftDays(today, -1);
  const rows: Row[] = [];

  for (const l of leads) {
    if (!l.interview_date) continue;
    const day = l.interview_date.slice(0, 10);
    if (day < windowFrom || day > windowTo) continue;

    const arrived = ARRIVED_STATUSES.includes(l.status) || arrivedIds.has(l.id);
    const outcome: Outcome = arrived ? "arrived" : PENDING_STATUSES.includes(l.status) ? "pending" : "not_arrived";
    rows.push({
      outcome,
      friend: friendGroupLabel(l.comes_with_friend),
      segment: candidateSegmentLabel(l.candidate_segment),
      source: (l.source ?? "").trim() || "אחר",
      reason: outcome === "not_arrived" ? l.no_arrival_reason : null,
    });
  }

  const reasonCounts = new Map<string | null, number>();
  for (const r of rows) {
    if (r.outcome !== "not_arrived") continue;
    reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);
  }

  return {
    windowFrom,
    windowTo,
    totals: summarize("סה״כ", rows),
    byFriend: groupBy(rows, (r) => r.friend),
    bySegment: groupBy(rows, (r) => r.segment),
    bySource: groupBy(rows, (r) => r.source),
    reasons: Array.from(reasonCounts.entries())
      .map(([code, count]) => ({ code, label: noArrivalReasonLabel(code), count }))
      .sort((a, b) => b.count - a.count),
  };
}

function israelToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

export async function computeArrivals(db: SupabaseClient): Promise<ArrivalReport> {
  const today = israelToday();
  const from = shiftDays(today, -WINDOW_DAYS);
  const [{ data: leads }, { data: history }] = await Promise.all([
    db
      .from("leads")
      .select("id, status, source, interview_date, candidate_segment, comes_with_friend, no_arrival_reason")
      .eq("interview_type", "in_person")
      .gte("interview_date", from)
      .lt("interview_date", today)
      .limit(10000),
    // מעבר ל"הגיע" קורה אחרי מועד הראיון — מספיק לחפש מתחילת החלון
    db
      .from("lead_status_history")
      .select("lead_id")
      .in("to_status", ARRIVED_STATUSES)
      .gte("changed_at", from)
      .limit(20000),
  ]);
  const arrivedIds = new Set(((history ?? []) as { lead_id: string }[]).map((h) => h.lead_id));
  return analyzeArrivals((leads ?? []) as ArrivalLead[], arrivedIds, today);
}
