// ============================================================
// Recruiter Assistant — data tools
// Read-only queries the AI assistant can call to ground its
// answers in live CRM data (leads, jobs, clients).
// ============================================================

import { phoneSearchTerm } from "@/lib/phone";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { STATUS_LABELS, LeadStatus, ALL_STATUSES, type LeadStatusValue } from "@/lib/stateMachine";
import { LEAD_SOURCES } from "@/lib/constants";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const ACTIVE_STATUSES: LeadStatusValue[] = [
  LeadStatus.NEW_LEAD,
  LeadStatus.CONTACTED,
  LeadStatus.SCREENING_IN_PROGRESS,
  LeadStatus.FIT_FOR_INTERVIEW,
  LeadStatus.INTERVIEW_BOOKED,
  LeadStatus.ARRIVED,
];

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// interview_date נשמר כשעון קיר ישראלי עם תווית UTC (ראו cron/daily) —
// השוואות מולו חייבות "עכשיו" באותה מסגרת, לא toISOString() אמיתי.
function ilWallIso(atMs: number = Date.now()): string {
  const d = new Date(atMs);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
  return `${day}T${time}Z`;
}

function label(status: string) {
  return STATUS_LABELS[status as LeadStatusValue] ?? status;
}

// ── Tools ───────────────────────────────────────────────────

export const assistantTools = [
  betaZodTool({
    name: "get_open_jobs",
    description:
      "רשימת המשרות הפתוחות (דרישות כוח אדם ממעסיקים): איזה מעסיק צריך איזה תפקיד, כמה עובדים חסרים, דחיפות, שכר ומיקום. השתמש כשהמגייסת שואלת 'איפה צריך X', 'מה חסר', 'מה דחוף', 'איזה משרות פתוחות'.",
    inputSchema: z.object({
      title_query: z
        .string()
        .optional()
        .describe("מילת חיפוש בשם התפקיד (למשל 'מלצר', 'טבח', 'חדרן'). ריק = כל התפקידים."),
      only_urgent: z.boolean().optional().describe("להחזיר רק משרות דחופות"),
    }),
    run: async ({ title_query, only_urgent }) => JSON.stringify(await (async () => {
      let q = admin()
        .from("jobs")
        .select("id, title, needed_count, assigned_count, pay_rate, location, requirements, urgent, status, notes, created_at, clients(name, city, status)")
        .eq("status", "Open")
        .order("urgent", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(60);
      if (title_query?.trim()) q = q.ilike("title", `%${title_query.trim()}%`);
      if (only_urgent) q = q.eq("urgent", true);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const jobs = (data ?? []).map((j) => {
        const c = j.clients as unknown as { name: string; city: string | null; status: string } | null;
        const missing = Math.max(0, (j.needed_count ?? 0) - (j.assigned_count ?? 0));
        return {
          job_id: j.id,
          title: j.title,
          client: c?.name ?? "—",
          client_city: c?.city ?? null,
          needed: j.needed_count,
          assigned: j.assigned_count,
          missing,
          urgent: j.urgent,
          pay_rate: j.pay_rate,
          location: j.location,
          requirements: j.requirements,
          notes: j.notes,
        };
      });
      return { count: jobs.length, jobs, jobs_page_url: "/jobs" };
    })()),
  }),

  betaZodTool({
    name: "get_pipeline_summary",
    description:
      "תמונת מצב של הפייפליין: כמה לידים בכל סטטוס, כמה חדשים ממתינים לנציג, כמה דורשים תשומת לב, כמה נכנסו לאחרונה ולפי איזה גורם גיוס. השתמש לשאלות כמו 'מה המצב', 'במה להתמקד היום', 'כמה לידים חדשים', 'איזה ערוץ מביא הכי הרבה'.",
    inputSchema: z.object({
      days: z.number().int().min(1).max(365).optional().describe("חלון זמן בימים לספירת לידים חדשים (ברירת מחדל 7)"),
    }),
    run: async ({ days }) => JSON.stringify(await (async () => {
      const window = days ?? 7;
      const db = admin();
      const [byStatus, recent, attention, interviewsUpcoming] = await Promise.all([
        Promise.all(
          ALL_STATUSES.map(async (s) => {
            const { count } = await db.from("leads").select("*", { count: "exact", head: true }).eq("status", s);
            return [s, count ?? 0] as const;
          })
        ),
        db.from("leads").select("source, status, job_title").gte("created_at", daysAgoIso(window)),
        db
          .from("leads")
          .select("id, name, attention_reason, human_attention_reason")
          .or("needs_attention.eq.true,needs_human_attention.eq.true")
          .limit(30),
        db
          .from("leads")
          .select("id, name, interview_date, hired_client, job_title")
          .eq("status", LeadStatus.INTERVIEW_BOOKED)
          .gte("interview_date", ilWallIso())
          .lte("interview_date", ilWallIso(Date.now() + 3 * 86400000))
          .order("interview_date", { ascending: true })
          .limit(30),
      ]);

      const bySource: Record<string, number> = {};
      const byJobTitle: Record<string, number> = {};
      for (const r of recent.data ?? []) {
        bySource[r.source ?? "אחר"] = (bySource[r.source ?? "אחר"] ?? 0) + 1;
        const jt = (r.job_title ?? "").trim();
        if (jt) byJobTitle[jt] = (byJobTitle[jt] ?? 0) + 1;
      }

      return {
        by_status: byStatus.map(([s, n]) => ({ status: s, label: label(s), count: n })),
        active_pipeline_total: byStatus.filter(([s]) => ACTIVE_STATUSES.includes(s)).reduce((a, [, n]) => a + n, 0),
        new_leads_last_days: { days: window, total: recent.data?.length ?? 0, by_source: bySource, by_job_title: byJobTitle },
        needs_attention: {
          count: attention.data?.length ?? 0,
          leads: (attention.data ?? []).map((l) => ({
            id: l.id,
            name: l.name,
            reason: l.human_attention_reason ?? l.attention_reason ?? null,
            url: `/leads/${l.id}`,
          })),
        },
        interviews_next_3_days: (interviewsUpcoming.data ?? []).map((l) => ({
          id: l.id,
          name: l.name,
          interview_date: l.interview_date,
          job_title: l.job_title,
          url: `/leads/${l.id}`,
        })),
        queue_url: "/leads",
      };
    })()),
  }),

  betaZodTool({
    name: "search_leads",
    description:
      "חיפוש מועמדים/לידים לפי סטטוס, תפקיד מבוקש, גורם גיוס, שם/טלפון, או לידים תקועים (ללא עדכון X ימים). מחזיר עד 25 תוצאות עם קישור לכרטיס הליד. השתמש לשאלות כמו 'תמצאי לי מלצרים פנויים', 'מי מחכה לראיון', 'מי תקוע בסינון', 'לידים מטיקטוק'.",
    inputSchema: z.object({
      statuses: z.array(z.enum(ALL_STATUSES as [LeadStatusValue, ...LeadStatusValue[]])).optional().describe("סטטוסים לסינון. ריק = הפייפליין הפעיל (לא כולל נדחה/לא התקבל/אבד קשר/לא מתאים/התחיל לעבוד)."),
      job_title_query: z.string().optional().describe("מילת חיפוש בתפקיד המבוקש של המועמד"),
      source: z.enum(LEAD_SOURCES as unknown as [string, ...string[]]).optional().describe("גורם גיוס"),
      name_or_phone: z.string().optional().describe("חיפוש חופשי בשם או טלפון"),
      stale_days: z.number().int().min(1).max(90).optional().describe("רק לידים שלא עודכנו X ימים (לזיהוי תקועים)"),
      only_needs_attention: z.boolean().optional(),
      limit: z.number().int().min(1).max(25).optional(),
    }),
    run: async (args) => JSON.stringify(await (async () => {
      let q = admin()
        .from("leads")
        .select("id, name, phone, job_title, location, status, sub_status, source, created_at, interview_date, needs_attention, needs_human_attention, attention_reason, human_attention_reason, screening_score, extracted_availability, notes")
        .order("created_at", { ascending: false })
        .limit(args.limit ?? 15);
      q = q.in("status", args.statuses?.length ? args.statuses : ACTIVE_STATUSES);
      if (args.job_title_query?.trim()) q = q.ilike("job_title", `%${args.job_title_query.trim()}%`);
      if (args.source) q = q.eq("source", args.source);
      if (args.name_or_phone?.trim()) {
        const s = args.name_or_phone.trim();
        { const t = phoneSearchTerm(s) ?? s; q = q.or(`name.ilike.%${t}%,phone.ilike.%${t}%`); }
      }
      if (args.only_needs_attention) q = q.or("needs_attention.eq.true,needs_human_attention.eq.true");
      const { data, error } = await q;
      if (error) return { error: error.message };
      let rows = data ?? [];
      // stale = created long ago and still in same early status (no updated_at column → approximate via created_at)
      if (args.stale_days) {
        const cutoff = daysAgoIso(args.stale_days);
        rows = rows.filter((l) => l.created_at < cutoff);
      }
      return {
        count: rows.length,
        leads: rows.map((l) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          job_title: l.job_title,
          location: l.location,
          status: label(l.status),
          sub_status: l.sub_status,
          source: l.source,
          created_at: l.created_at,
          interview_date: l.interview_date,
          attention: l.needs_attention || l.needs_human_attention ? (l.human_attention_reason ?? l.attention_reason ?? "כן") : null,
          screening_score: l.screening_score,
          availability: l.extracted_availability,
          notes: l.notes ? String(l.notes).slice(0, 160) : null,
          url: `/leads/${l.id}`,
        })),
      };
    })()),
  }),

  betaZodTool({
    name: "get_interviews",
    description:
      "לוח הראיונות: כל הראיונות המתוזמנים לפי יום ושעה — שם המועמד, טלפון, תפקיד, מעסיק, סוג (פרונטלי/וידאו), רכזת, סטטוס (ראיון נקבע / הגיע / לא הגיע). קרא לזה כשהמגייסת שואלת 'מי מגיע היום/מחר', 'מתי הראיון של X', 'איזה ראיונות יש למלצרים השבוע', 'מה יש לי מחר ב-10'. ברירת מחדל: מהיום ל-7 ימים קדימה.",
    inputSchema: z.object({
      from_date: z.string().optional().describe("YYYY-MM-DD (ברירת מחדל היום)"),
      to_date: z.string().optional().describe("YYYY-MM-DD (ברירת מחדל 7 ימים קדימה)"),
      job_title_query: z.string().optional().describe("סינון לפי תפקיד"),
      client_query: z.string().optional().describe("סינון לפי מעסיק"),
      name_or_phone: z.string().optional(),
      include_past_outcomes: z.boolean().optional().describe("לכלול גם ראיונות שעברו (הגיע/לא הגיע) בטווח"),
    }),
    run: async (args) => JSON.stringify(await (async () => {
      const tz = "Asia/Jerusalem";
      const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
      const from = args.from_date ?? todayKey;
      const to = args.to_date ?? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() + 7 * 86400000));
      let q = admin()
        .from("leads")
        .select("id, name, phone, job_title, hired_position, hired_client, location, status, interview_date, interview_type, interview_notes, handled_by, preferences")
        .not("interview_date", "is", null)
        // שעון קיר ישראלי עם תווית UTC — הגבולות באותה מסגרת
        .gte("interview_date", `${from}T00:00:00Z`)
        .lte("interview_date", `${to}T23:59:59Z`)
        .order("interview_date", { ascending: true })
        .limit(200);
      const statuses: LeadStatusValue[] = args.include_past_outcomes
        ? [LeadStatus.INTERVIEW_BOOKED, LeadStatus.ARRIVED, LeadStatus.NO_SHOW, LeadStatus.HIRED, LeadStatus.STARTED]
        : [LeadStatus.INTERVIEW_BOOKED, LeadStatus.ARRIVED];
      q = q.in("status", statuses);
      if (args.job_title_query?.trim()) q = q.ilike("job_title", `%${args.job_title_query.trim()}%`);
      if (args.name_or_phone?.trim()) {
        const s = args.name_or_phone.trim();
        { const t = phoneSearchTerm(s) ?? s; q = q.or(`name.ilike.%${t}%,phone.ilike.%${t}%`); }
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      let rows = (data ?? []).map((l) => {
        const matched = (l.preferences as Record<string, unknown> | null)?.matched_client;
        const d = new Date(l.interview_date as string);
        return {
          id: l.id,
          name: l.name,
          phone: l.phone,
          date: d.toLocaleDateString("he-IL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "numeric" }),
          time: d.toLocaleTimeString("he-IL", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }),
          iso: l.interview_date,
          job_title: l.hired_position ?? l.job_title,
          client: l.hired_client ?? (typeof matched === "string" ? matched : null),
          type: l.interview_type === "video" ? "וידאו" : l.interview_type === "phone" ? "טלפוני" : l.interview_type === "in_person" ? "פרונטלי" : null,
          status: label(l.status),
          recruiter: l.handled_by,
          location: l.location,
          notes: l.interview_notes,
          url: `/leads/${l.id}`,
        };
      });
      if (args.client_query?.trim()) rows = rows.filter((r) => (r.client ?? "").includes(args.client_query!.trim()));
      const params = new URLSearchParams({ type: "interviews", from, to });
      if (args.job_title_query) params.set("job", args.job_title_query);
      if (args.client_query) params.set("client", args.client_query);
      return {
        range: { from, to },
        count: rows.length,
        interviews: rows,
        board_url: "/interviews",
        csv_download_url: `/api/assistant/export?${params.toString()}`,
      };
    })()),
  }),

  betaZodTool({
    name: "get_job_matches",
    description:
      "מועמדים שהכי מתאימים למשרה פתוחה מסוימת (דירוג אוטומטי לפי תפקיד, מיקום, ניסיון, סטטוס). קודם קרא ל-get_open_jobs כדי לקבל job_id. השתמש כשהמגייסת שואלת 'מי מתאים למשרה של X אצל Y', 'את מי לשלוח למלון Z'.",
    inputSchema: z.object({
      job_id: z.string().uuid(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    run: async ({ job_id, limit }) => JSON.stringify(await (async () => {
      const { data, error } = await admin().rpc("match_candidates_for_job", { p_job_id: job_id, p_limit: limit ?? 10 });
      if (error) return { error: error.message };
      return {
        matches: ((data ?? []) as Array<Record<string, unknown>>).map((m) => ({
          ...m,
          status: label(String(m.status)),
          url: `/leads/${m.lead_id}`,
        })),
      };
    })()),
  }),

  betaZodTool({
    name: "get_clients",
    description:
      "רשימת מעסיקים (לקוחות) עם סטטוס (פעיל/מוקפא/חוב), עיר, סוג, ומספר משרות פתוחות לכל אחד. השתמש לשאלות על מעסיקים.",
    inputSchema: z.object({
      name_query: z.string().optional(),
      only_active: z.boolean().optional(),
    }),
    run: async ({ name_query, only_active }) => JSON.stringify(await (async () => {
      const db = admin();
      let q = db.from("clients").select("id, name, contact_person, phone, type, status, city").order("name").limit(100);
      if (name_query?.trim()) q = q.ilike("name", `%${name_query.trim()}%`);
      if (only_active) q = q.eq("status", "Active");
      const [{ data: clients, error }, { data: jobs }] = await Promise.all([
        q,
        db.from("jobs").select("client_id, needed_count, assigned_count").eq("status", "Open"),
      ]);
      if (error) return { error: error.message };
      const openByClient: Record<string, { jobs: number; missing: number }> = {};
      for (const j of jobs ?? []) {
        const e = (openByClient[j.client_id] ??= { jobs: 0, missing: 0 });
        e.jobs++;
        e.missing += Math.max(0, (j.needed_count ?? 0) - (j.assigned_count ?? 0));
      }
      return {
        clients: (clients ?? []).map((c) => ({
          ...c,
          open_jobs: openByClient[c.id]?.jobs ?? 0,
          workers_missing: openByClient[c.id]?.missing ?? 0,
        })),
        clients_page_url: "/clients",
      };
    })()),
  }),

  betaZodTool({
    name: "get_hired_report",
    description:
      "דוח מועסקים: מי התקבל/התחיל לעבוד, אצל איזה מעסיק, באיזה תפקיד, ומתי — עם סיכום לפי מעסיק. השתמש לשאלות 'כמה השמנו החודש', 'כמה התקבלו למלון X', 'תוציאי דוח מועסקים'. כולל קישור להורדת CSV.",
    inputSchema: z.object({
      client_query: z.string().optional().describe("סינון לפי שם מעסיק"),
      from_date: z.string().optional().describe("YYYY-MM-DD"),
      to_date: z.string().optional().describe("YYYY-MM-DD"),
    }),
    run: async ({ client_query, from_date, to_date }) => JSON.stringify(await (async () => {
      let q = admin()
        .from("leads")
        .select("id, name, phone, job_title, hired_client, hired_position, start_date, status, created_at, preferences")
        .in("status", [LeadStatus.HIRED, LeadStatus.STARTED])
        .order("created_at", { ascending: false })
        .limit(500);
      if (from_date) q = q.gte("created_at", `${from_date}T00:00:00`);
      if (to_date) q = q.lte("created_at", `${to_date}T23:59:59`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      let rows = (data ?? []).map((l) => {
        const matched = (l.preferences as Record<string, unknown> | null)?.matched_client;
        return {
          id: l.id,
          name: l.name,
          phone: l.phone,
          client: l.hired_client ?? (typeof matched === "string" ? matched : null),
          position: l.hired_position ?? l.job_title,
          start_date: l.start_date,
          status: label(l.status),
          created_at: l.created_at,
          url: `/leads/${l.id}`,
        };
      });
      if (client_query?.trim()) {
        const s = client_query.trim();
        rows = rows.filter((r) => (r.client ?? "").includes(s));
      }
      const byClient: Record<string, number> = {};
      for (const r of rows) byClient[r.client ?? "לא צוין"] = (byClient[r.client ?? "לא צוין"] ?? 0) + 1;

      const params = new URLSearchParams({ type: "hired" });
      if (client_query) params.set("client", client_query);
      if (from_date) params.set("from", from_date);
      if (to_date) params.set("to", to_date);

      return {
        total: rows.length,
        by_client: byClient,
        rows: rows.slice(0, 40),
        truncated: rows.length > 40,
        report_page_url: "/reports?tab=hired",
        csv_download_url: `/api/assistant/export?${params.toString()}`,
      };
    })()),
  }),

  betaZodTool({
    name: "export_leads_csv",
    description:
      "יוצר קישור להורדת קובץ CSV (נפתח באקסל) של לידים לפי סינון — סטטוסים, גורם גיוס, טווח תאריכים. השתמש כשהמגייסת מבקשת 'להוציא דוח', 'לייצא לאקסל', 'רשימה של...'. החזר למגייסת את הקישור.",
    inputSchema: z.object({
      statuses: z.array(z.enum(ALL_STATUSES as [LeadStatusValue, ...LeadStatusValue[]])).optional(),
      source: z.enum(LEAD_SOURCES as unknown as [string, ...string[]]).optional(),
      from_date: z.string().optional().describe("YYYY-MM-DD"),
      to_date: z.string().optional().describe("YYYY-MM-DD"),
      job_title_query: z.string().optional(),
    }),
    run: async (args) => JSON.stringify(await (async () => {
      const params = new URLSearchParams({ type: "leads" });
      if (args.statuses?.length) params.set("statuses", args.statuses.join(","));
      if (args.source) params.set("source", args.source);
      if (args.from_date) params.set("from", args.from_date);
      if (args.to_date) params.set("to", args.to_date);
      if (args.job_title_query) params.set("job", args.job_title_query);
      return { csv_download_url: `/api/assistant/export?${params.toString()}` };
    })()),
  }),
];
