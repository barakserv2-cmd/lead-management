import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { LeadStatus, type LeadStatusValue } from "@/lib/stateMachine";
import { AutoRefresh } from "./auto-refresh";
import { StatusSelect } from "../leads/status-select";
import { LeadNotesDialog } from "../leads/lead-notes-dialog";
import { DayNav } from "./day-nav";

export const dynamic = "force-dynamic";

type Row = {
  handled_by: string | null;
  recruiter_name: string | null;
  lead_id: string;
  lead_name: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatusValue;
  sub_status: string | null;
  effective_at: string;
  handled_at: string | null;
  job_title: string | null;
  location: string | null;
};

const UNHANDLED = "__unhandled__";        // status still NEW_LEAD — truly untouched
const UNATTRIBUTED = "__unattributed__";  // has a real status but no recruiter (automation/legacy)

function ilTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// YYYY-MM-DD לפי לוח ישראל — מפתח היום שהלוח עובד לפיו
function ilDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
}
function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function ilDayLabel(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function waHref(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.startsWith("0") ? "972" + d.slice(1) : d}`;
}

// Buckets for the summary strip — what a manager wants at a glance.
const SUMMARY: { label: string; statuses: LeadStatusValue[]; tone: string }[] = [
  { label: "טרם טופלו", statuses: [LeadStatus.NEW_LEAD], tone: "text-amber-600" },
  { label: "נוצר קשר", statuses: [LeadStatus.CONTACTED], tone: "text-cyan-700" },
  {
    label: "ראיון נקבע / הגיע",
    statuses: [LeadStatus.FIT_FOR_INTERVIEW, LeadStatus.INTERVIEW_BOOKED, LeadStatus.ARRIVED],
    tone: "text-violet-700",
  },
  { label: "התקבלו", statuses: [LeadStatus.HIRED, LeadStatus.STARTED], tone: "text-emerald-700" },
  {
    label: "לא מתאים / נדחה / לא התקבל",
    statuses: [LeadStatus.NOT_SUITABLE, LeadStatus.REJECTED, LeadStatus.NOT_ACCEPTED, LeadStatus.LOST_CONTACT],
    tone: "text-slate-500",
  },
];

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ recruiter?: string; date?: string }>;
}) {
  const { recruiter: recruiterParam, date: dateParam } = await searchParams;

  const todayKey = ilDateKey(new Date());
  // תאריך עתידי או פורמט לא תקין — נופלים חזרה להיום במקום להציג לוח ריק
  const requested = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? dateParam! : todayKey;
  const selectedDate = requested > todayKey ? todayKey : requested;
  const isToday = selectedDate === todayKey;
  const isYesterday = selectedDate === addDays(todayKey, -1);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("get_today_leads_by_recruiter", {
    p_date: selectedDate,
  });
  const rows = (data ?? []) as Row[];

  // Group into: recruiters (by name) · "handled but unattributed" (real status,
  // no recruiter — automation/legacy) · "not yet handled" (still NEW_LEAD).
  const groups = new Map<string, { name: string; rows: Row[] }>();
  for (const r of rows) {
    let key: string;
    let name: string;
    if (r.handled_by) {
      key = r.handled_by;
      name = r.recruiter_name || r.handled_by;
    } else if (r.status === LeadStatus.NEW_LEAD) {
      key = UNHANDLED;
      name = "טרם טופלו";
    } else {
      key = UNATTRIBUTED;
      name = "טופל (לא משויך)";
    }
    if (!groups.has(key)) groups.set(key, { name, rows: [] });
    groups.get(key)!.rows.push(r);
  }
  // recruiters first (by size), then unattributed, then untouched last
  const rank = (k: string) => (k === UNHANDLED ? 2 : k === UNATTRIBUTED ? 1 : 0);
  const ordered = [...groups.entries()].sort((a, b) => {
    if (rank(a[0]) !== rank(b[0])) return rank(a[0]) - rank(b[0]);
    return b[1].rows.length - a[1].rows.length;
  });

  const activeRecruiter = recruiterParam && groups.has(recruiterParam) ? recruiterParam : null;
  const visible = activeRecruiter
    ? ordered.filter(([key]) => key === activeRecruiter)
    : ordered;
  const visibleRows = visible.flatMap(([, g]) => g.rows);

  const summary = SUMMARY.map((s) => ({
    ...s,
    count: visibleRows.filter((r) => s.statuses.includes(r.status)).length,
  }));

  return (
    <div dir="rtl" className="p-6 max-w-6xl mx-auto">
      {/* refresh the board every 15s so handling/new leads appear near-live —
          pointless on a past day, where nothing new can land */}
      {isToday && <AutoRefresh intervalMs={15000} />}

      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isToday ? "לידים של היום" : isYesterday ? "לידים של אתמול" : "לידים לפי תאריך"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {ilDayLabel(selectedDate)} · מחולק לפי הרכזת שטיפלה
            {isToday ? " · מתעדכן אוטומטית" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DayNav
            selected={selectedDate}
            todayKey={todayKey}
            yesterdayKey={addDays(todayKey, -1)}
            recruiter={recruiterParam ?? null}
          />
          <Link
            href="/leads"
            className="text-sm text-cyan-700 hover:underline whitespace-nowrap"
          >
            לכל הלידים ←
          </Link>
        </div>
      </div>

      {/* ═══ Summary strip ═══ */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        <div className="bg-white border rounded-xl px-4 py-3">
          <div className="text-xs text-slate-500">{isToday ? "סה״כ היום" : "סה״כ ביום זה"}</div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">{visibleRows.length}</div>
        </div>
        {summary.map((s) => (
          <div key={s.label} className="bg-white border rounded-xl px-4 py-3">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className={`text-2xl font-bold tabular-nums ${s.tone}`}>{s.count}</div>
          </div>
        ))}
      </div>

      {/* ═══ Recruiter filter ═══ */}
      {ordered.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <Link
            href={isToday ? "/today" : `/today?date=${selectedDate}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              !activeRecruiter
                ? "border-cyan-400 bg-cyan-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-cyan-300"
            }`}
          >
            הכל ({rows.length})
          </Link>
          {ordered.map(([key, group]) => (
            <Link
              key={key}
              href={`/today?recruiter=${encodeURIComponent(key)}${isToday ? "" : `&date=${selectedDate}`}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeRecruiter === key
                  ? "border-cyan-400 bg-cyan-600 text-white"
                  : key === UNHANDLED
                    ? "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400"
                    : "border-slate-200 bg-white text-slate-600 hover:border-cyan-300"
              }`}
            >
              {group.name} ({group.rows.length})
            </Link>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">
          שגיאה בטעינת הלידים: {error.message}
        </div>
      )}

      {!error && rows.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-slate-400">
          {isToday ? "עדיין לא נכנסו לידים היום." : "לא נכנסו לידים בתאריך הזה."}
        </div>
      )}

      {/* ═══ Groups ═══ */}
      <div className="space-y-5">
        {visible.map(([key, group]) => {
          const untouched = key === UNHANDLED;
          return (
            <section
              key={key}
              className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm"
            >
              <div
                className={`flex items-center justify-between px-4 py-2.5 border-b ${
                  untouched
                    ? "bg-amber-50 border-amber-200"
                    : key === UNATTRIBUTED
                      ? "bg-slate-50 border-slate-200"
                      : "bg-cyan-50 border-cyan-100"
                }`}
              >
                <h2 className={`font-semibold ${untouched ? "text-amber-900" : "text-slate-800"}`}>
                  {group.name}
                </h2>
                <span className="text-sm font-medium text-slate-500 bg-white rounded-full px-3 py-0.5 border border-slate-200">
                  {group.rows.length}
                </span>
              </div>

              {/* column headers */}
              <div className="hidden md:grid grid-cols-[56px_1.4fr_150px_1fr_190px_auto] gap-3 px-4 py-1.5 text-[11px] text-slate-400 border-b bg-slate-50/60">
                <span>שעה</span>
                <span>מועמד</span>
                <span>טלפון</span>
                <span>מקור</span>
                <span>סטטוס</span>
                <span className="text-left">פעולות</span>
              </div>

              <ul className="divide-y divide-slate-100">
                {group.rows.map((r) => {
                  return (
                    <li
                      key={r.lead_id}
                      className={`grid grid-cols-1 md:grid-cols-[56px_1.4fr_150px_1fr_190px_auto] gap-x-3 gap-y-1 items-center px-4 py-2.5 hover:bg-slate-50/80 transition-colors ${
                        untouched ? "bg-amber-50/30" : ""
                      }`}
                    >
                      {/* time */}
                      <span
                        className="text-xs text-slate-400 tabular-nums"
                        title={
                          r.handled_at
                            ? `עדכון אחרון ${ilTime(r.handled_at)} · הגיע ${ilTime(r.effective_at)}`
                            : `הגיע ${ilTime(r.effective_at)} — טרם טופל`
                        }
                      >
                        {ilTime(r.handled_at ?? r.effective_at)}
                      </span>

                      {/* candidate */}
                      <div className="min-w-0">
                        <Link
                          href={`/leads/${r.lead_id}`}
                          className="font-semibold text-slate-900 hover:text-cyan-700 hover:underline truncate block"
                        >
                          {r.lead_name || "ללא שם"}
                        </Link>
                        {(r.job_title || r.location) && (
                          <div className="text-xs text-slate-500 truncate">
                            {r.job_title}
                            {r.job_title && r.location ? " · " : ""}
                            {r.location && <span>📍 {r.location}</span>}
                          </div>
                        )}
                      </div>

                      {/* phone */}
                      <div className="text-sm tabular-nums" dir="ltr">
                        {r.phone ? (
                          <span className="inline-flex items-center gap-2">
                            <a href={`tel:${r.phone}`} className="text-slate-700 hover:text-cyan-700 font-medium">
                              {r.phone}
                            </a>
                            <a
                              href={waHref(r.phone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-800 text-[11px] font-bold"
                              title="וואטסאפ"
                            >
                              WA
                            </a>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>

                      {/* source */}
                      <span className="text-xs text-slate-500 truncate">
                        {r.source ? (
                          <span className="bg-slate-100 rounded px-1.5 py-0.5">{r.source}</span>
                        ) : (
                          "—"
                        )}
                      </span>

                      {/* status (inline change) */}
                      <div className="flex flex-col gap-0.5">
                        <StatusSelect
                          leadId={r.lead_id}
                          currentStatus={r.status}
                          currentSubStatus={r.sub_status}
                        />
                      </div>

                      {/* actions */}
                      <div className="flex items-center justify-end gap-1.5">
                        <LeadNotesDialog leadId={r.lead_id} leadName={r.lead_name || "ללא שם"} size="xs" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
