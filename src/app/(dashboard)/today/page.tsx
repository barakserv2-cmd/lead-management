import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/api-auth";
import {
  LeadStatus,
  STATUS_LABELS,
  STATUS_COLORS,
  type LeadStatusValue,
} from "@/lib/stateMachine";
import { AutoRefresh } from "./auto-refresh";

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

function ilToday(): string {
  return new Date().toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ recruiter?: string }>;
}) {
  const { recruiter: recruiterParam } = await searchParams;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("get_today_leads_by_recruiter");
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

  // סינון לפי רכזת: הכפתורים נבנים מכל הקבוצות של היום (עם ספירה),
  // והרשימה מציגה רק את הקבוצה שנבחרה. router.refresh שומר על ה-URL.
  const activeRecruiter = recruiterParam && groups.has(recruiterParam) ? recruiterParam : null;
  const visible = activeRecruiter
    ? ordered.filter(([key]) => key === activeRecruiter)
    : ordered;
  const visibleCount = visible.reduce((sum, [, g]) => sum + g.rows.length, 0);

  return (
    <div dir="rtl" className="p-6 max-w-5xl mx-auto">
      {/* refresh the board every 15s so handling/new leads appear near-live */}
      <AutoRefresh intervalMs={15000} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">לידים של היום</h1>
        <p className="text-sm text-slate-500 mt-1">
          {ilToday()} · {activeRecruiter ? `${visibleCount} מתוך ${rows.length}` : rows.length} לידים · מחולק לפי הרכזת שטיפלה · מתעדכן אוטומטית
        </p>
      </div>

      {/* סינון לפי רכזת */}
      {ordered.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mb-5">
          <Link
            href="/today"
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
              href={`/today?recruiter=${encodeURIComponent(key)}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeRecruiter === key
                  ? "border-cyan-400 bg-cyan-600 text-white"
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
          עדיין לא נכנסו לידים היום.
        </div>
      )}

      <div className="space-y-6">
        {visible.map(([key, group]) => (
          <section
            key={key}
            className="rounded-xl border border-slate-200 bg-white overflow-hidden"
          >
            <div
              className={`flex items-center justify-between px-5 py-3 border-b ${
                key === UNHANDLED || key === UNATTRIBUTED
                  ? "bg-slate-50 border-slate-200"
                  : "bg-cyan-50 border-cyan-100"
              }`}
            >
              <h2 className="font-semibold text-slate-800">{group.name}</h2>
              <span className="text-sm font-medium text-slate-500 bg-white rounded-full px-3 py-0.5 border border-slate-200">
                {group.rows.length}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {group.rows.map((r) => {
                const c = STATUS_COLORS[r.status] ?? {
                  bg: "bg-slate-100",
                  text: "text-slate-700",
                  dot: "bg-slate-400",
                };
                return (
                  <li key={r.lead_id}>
                    <Link
                      href={`/leads/${r.lead_id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <span
                        className="text-xs text-slate-400 w-12 shrink-0 tabular-nums"
                        title={r.handled_at ? `עדכון אחרון ${ilTime(r.handled_at)} · הגיע ${ilTime(r.effective_at)}` : `הגיע ${ilTime(r.effective_at)} — טרם טופל`}
                      >
                        {ilTime(r.handled_at ?? r.effective_at)}
                      </span>
                      <span className="font-medium text-slate-800 truncate min-w-0 flex-1">
                        {r.lead_name || "ללא שם"}
                      </span>
                      {r.phone && (
                        <span className="text-sm text-slate-500 tabular-nums hidden sm:block">
                          {r.phone}
                        </span>
                      )}
                      {r.source && (
                        <span className="text-xs text-slate-400 truncate max-w-[120px] hidden md:block">
                          {r.source}
                        </span>
                      )}
                      <span className="shrink-0 flex flex-col items-end gap-0.5">
                        <span
                          className={`text-xs font-medium rounded-full px-2.5 py-1 ${c.bg} ${c.text}`}
                        >
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                        {r.sub_status && (
                          <span className="text-[11px] text-slate-500 leading-tight">
                            {r.sub_status}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
