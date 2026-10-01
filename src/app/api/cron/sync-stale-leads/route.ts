import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { LeadStatus } from "@/lib/stateMachine";
import { sweepVerdict, type SweepLead } from "@/lib/staleLeadSweep";
import { hasCronSecret } from "@/lib/secrets";
import { postLeadToMachine } from "@/lib/machineBridge";
import { withHeartbeat } from "@/lib/jobHealth";

// הרשת השנייה מתחת ל-sync-new-leads: ליד שהחלון בן 3 הדקות פספס (גובגט
// היה מנותק, הגשר נפל) או שרכזת מחזיקה אותו שעות בלי לכתוב — חוזר לגובגט.
// רץ כל רבע שעה; גובגט מזהה כפילות (R-102) ולכן דחיפה חוזרת אינה מסוכנת.

export const maxDuration = 60;

const WINDOW_DAYS = 7;
const MAX_PER_RUN = 40; // תקרה מכוונת: מכסה יומית ומוניטין המספר קודמים ל"לסגור את הפער היום"
// לא כל המשפך שלפני הראיון — רק מה שאף אדם לא נגע בו. ב-v1 שיחת טלפון
// אינה נרשמת כהודעה, אבל היא כן מזיזה סטטוס: "נוצר קשר" על ליד בלי הודעות
// פירושו רכזת שהרימה טלפון, ופתיחה של גובגט שם היא קול שני באותה שיחה.
const OPEN: readonly string[] = [LeadStatus.NEW_LEAD, LeadStatus.SCREENING_IN_PROGRESS];

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
function isAuthorized(req: NextRequest): boolean {
  return hasCronSecret(req);
}

export const GET = withHeartbeat("sync-stale-leads", async (req: NextRequest) => {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = process.env.MACHINE_INGEST_URL;
  const key = process.env.MACHINE_INGEST_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "machine bridge not configured" });

  const db = getAdmin();
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

  const { data: rows, error } = await db
    .from("leads")
    .select("id, phone, name, location, source, job_title, status, created_at, handled_by, handled_at, do_not_contact")
    .gte("created_at", since)
    .in("status", OPEN)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // מי מהם כבר קיבל הודעה כלשהי — שאילתה אחת, לא אחת לליד
  const ids = (rows ?? []).map((r) => r.id);
  const contacted = new Set<string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db
      .from("messages")
      .select("lead_id")
      .in("lead_id", ids.slice(i, i + 300))
      .in("role", ["assistant", "recruiter"]);
    for (const m of data ?? []) contacted.add(m.lead_id as string);
  }

  const now = new Date();
  let pushed = 0;
  let failed = 0;
  let streak = 0;
  let lastError: string | undefined;
  const reasons: Record<string, number> = {};
  for (const r of rows ?? []) {
    const lead: SweepLead = {
      phone: r.phone, source: r.source, status: r.status, created_at: r.created_at,
      handled_by: r.handled_by, handled_at: r.handled_at,
      do_not_contact: r.do_not_contact, hasOutbound: contacted.has(r.id),
    };
    const v = sweepVerdict(lead, OPEN, now);
    reasons[v.why] = (reasons[v.why] ?? 0) + 1;
    if (!v.push) continue;
    if (pushed >= MAX_PER_RUN) { reasons.capped = (reasons.capped ?? 0) + 1; continue; }
    // גובגט לא עונה — לא שורפים את הריצה על timeouts; הריצה הבאה תנסה שוב,
    // וזו בדיוק הנקודה
    if (streak >= 3) { reasons.bridge_down = (reasons.bridge_down ?? 0) + 1; continue; }
    const res = await postLeadToMachine(r);
    if (res.ok) {
      pushed++;
      streak = 0;
    } else {
      failed++;
      streak++;
      lastError = res.error;
    }
  }

  return NextResponse.json({ ok: true, considered: rows?.length ?? 0, pushed, failed, lastError, reasons });
});
