import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/api-auth";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  type LeadStatusValue,
} from "@/lib/stateMachine";

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

const UNHANDLED = "__unhandled__";

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

export default async function TodayPage() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("get_today_leads_by_recruiter");
  const rows = (data ?? []) as Row[];

  // Group by handling recruiter; unhandled last.
  const groups = new Map<string, { name: string; rows: Row[] }>();
  for (const r of rows) {
    const key = r.handled_by ?? UNHANDLED;
    const name =
      r.handled_by == null ? "טרם טופלו" : r.recruiter_name || r.handled_by;
    if (!groups.has(key)) groups.set(key, { name, rows: [] });
    groups.get(key)!.rows.push(r);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    if (a[0] === UNHANDLED) return 1;
    if (b[0] === UNHANDLED) return -1;
    return b[1].rows.length - a[1].rows.length;
  });

  return (
    <div dir="rtl" className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">לידים של היום</h1>
        <p className="text-sm text-slate-500 mt-1">
          {ilToday()} · {rows.length} לידים · מחולק לפי הרכזת שטיפלה
        </p>
      </div>

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
        {ordered.map(([key, group]) => (
          <section
            key={key}
            className="rounded-xl border border-slate-200 bg-white overflow-hidden"
          >
            <div
              className={`flex items-center justify-between px-5 py-3 border-b ${
                key === UNHANDLED
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
                      <span className="text-xs text-slate-400 w-12 shrink-0 tabular-nums">
                        {ilTime(r.effective_at)}
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
