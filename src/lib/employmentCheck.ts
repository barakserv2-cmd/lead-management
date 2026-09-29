// ============================================================
// "עדיין עובד?" — עובדים פעילים שכדאי לאמת מול הרכזות
// ============================================================
//
// דוח השימור אמין רק כשמי שעזב מסומן "סיום העסקה". ב-29/09 רוב העזיבות
// שנרשמו קרו תוך 0–3 ימים, והרבה מהן בלי שסומן "התחיל לעבוד" — כלומר גם
// בין ה"פעילים" יש כנראה כאלה שלא הגיעו או כבר עזבו. הרשימה מסמנת את מי
// שיש לו סימן לכך:
//   not_started — "התקבל" ותאריך ההתחלה עבר, ולא סומן "התחיל לעבוד".
//   no_contact  — לא כתב אף הודעה בוואטסאפ מאז תאריך ההתחלה.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LeadStatus } from "./stateMachine";

export type CheckReason = "not_started" | "no_contact";

export const CHECK_REASON_LABELS: Record<CheckReason, string> = {
  not_started: "תאריך ההתחלה עבר ולא סומן \"התחיל לעבוד\"",
  no_contact: "לא כתב בוואטסאפ מאז שהתחיל",
};

/** כמה ימים אחרי ההתחלה שתיקה בוואטסאפ נחשבת סימן. */
export const NO_CONTACT_AFTER_DAYS = 3;

export interface ActiveWorker {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
  start_date: string;
  hired_client: string | null;
  handled_by: string | null;
  /** ההודעה הנכנסת האחרונה מהעובד, אם יש */
  last_inbound: string | null;
}

export interface CheckItem extends ActiveWorker {
  daysSinceStart: number;
  reasons: CheckReason[];
}

function dayDiff(from: string, to: string): number {
  return Math.round(
    (new Date(`${to.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${from.slice(0, 10)}T00:00:00Z`).getTime()) /
      86_400_000
  );
}

/** Pure. today = YYYY-MM-DD בשעון ישראל. */
export function classifyActiveWorkers(workers: ActiveWorker[], today: string): CheckItem[] {
  const out: CheckItem[] = [];
  for (const w of workers) {
    const days = dayDiff(w.start_date, today);
    if (days < 0) continue; // עוד לא התחיל
    const reasons: CheckReason[] = [];
    if (w.status === LeadStatus.HIRED && days >= 1) reasons.push("not_started");
    const wroteSinceStart = !!w.last_inbound && w.last_inbound.slice(0, 10) >= w.start_date.slice(0, 10);
    if (!wroteSinceStart && days >= NO_CONTACT_AFTER_DAYS) reasons.push("no_contact");
    if (reasons.length > 0) out.push({ ...w, daysSinceStart: days, reasons });
  }
  // קודם מי שיש לו שני סימנים, ואז הוותיקים יותר
  return out.sort((a, b) => b.reasons.length - a.reasons.length || b.daysSinceStart - a.daysSinceStart);
}

function israelToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

export async function computeEmploymentCheck(db: SupabaseClient): Promise<CheckItem[]> {
  const today = israelToday();
  const { data: leads } = await db
    .from("leads")
    .select("id, name, phone, status, start_date, hired_client, handled_by")
    .in("status", [LeadStatus.HIRED, LeadStatus.STARTED])
    .not("start_date", "is", null)
    .lte("start_date", today)
    .limit(2000);
  const rows = (leads ?? []) as Omit<ActiveWorker, "last_inbound">[];
  if (rows.length === 0) return [];

  const lastInbound = new Map<string, string>();
  const ids = rows.map((r) => r.id);
  // בקבוצות — כדי שרשימת ה-id לא תנפח את ה-URL
  for (let i = 0; i < ids.length; i += 200) {
    const { data: msgs } = await db
      .from("messages")
      .select("lead_id, created_at")
      .eq("role", "user")
      .in("lead_id", ids.slice(i, i + 200))
      .order("created_at", { ascending: false })
      .limit(5000);
    for (const m of (msgs ?? []) as { lead_id: string; created_at: string }[]) {
      if (!lastInbound.has(m.lead_id)) lastInbound.set(m.lead_id, m.created_at);
    }
  }

  return classifyActiveWorkers(
    rows.map((r) => ({ ...r, last_inbound: lastInbound.get(r.id) ?? null })),
    today
  );
}
