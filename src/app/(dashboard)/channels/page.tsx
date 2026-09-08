import { redirect } from "next/navigation";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";

// Channel performance tracker (Stage A): per source — volume, response speed,
// and conversion — so we can watch גובגט's instant-response lift dead channels
// before deciding where to spend. Median response = lead created → first
// outbound (assistant=גובגט or recruiter).

const INTERVIEW_PLUS = ["INTERVIEW_BOOKED", "ARRIVED", "HIRED", "STARTED", "NO_SHOW", "NOT_ACCEPTED", "EMPLOYMENT_ENDED"];
const HIRED = ["HIRED", "STARTED", "EMPLOYMENT_ENDED"];
const DAYS = 30;

export default async function ChannelsPage() {
  const user = await getAuthedUser();
  if (!user) redirect("/login");
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();

  // paginate leads
  const leads: { id: string; source: string | null; status: string; created_at: string }[] = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await db.from("leads").select("id, source, status, created_at").gte("created_at", since).range(f, f + 999);
    if (data) leads.push(...data);
    if (!data || data.length < 1000) break;
  }
  const ids = leads.map((l) => l.id);

  // first outbound time per lead
  const firstOut = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from("messages").select("lead_id, created_at").in("lead_id", ids.slice(i, i + 300)).in("role", ["assistant", "recruiter"]).order("created_at", { ascending: true });
    for (const m of data ?? []) if (!firstOut.has(m.lead_id)) firstOut.set(m.lead_id, new Date(m.created_at).getTime());
  }

  type Row = { source: string; leads: number; interview: number; hired: number; resp: number[] };
  const map = new Map<string, Row>();
  for (const l of leads) {
    const s = l.source || "לא ידוע";
    if (!map.has(s)) map.set(s, { source: s, leads: 0, interview: 0, hired: 0, resp: [] });
    const row = map.get(s)!;
    row.leads++;
    if (INTERVIEW_PLUS.includes(l.status)) row.interview++;
    if (HIRED.includes(l.status)) row.hired++;
    const o = firstOut.get(l.id);
    if (o !== undefined) { const d = (o - new Date(l.created_at).getTime()) / 60000; if (d >= 0) row.resp.push(d); }
  }
  const rows = [...map.values()].sort((a, b) => b.leads - a.leads);
  const med = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const totals = rows.reduce((t, r) => ({ leads: t.leads + r.leads, interview: t.interview + r.interview, hired: t.hired + r.hired }), { leads: 0, interview: 0, hired: 0 });

  const convClass = (p: number) => (p >= 8 ? "text-green-600" : p >= 4 ? "text-amber-600" : "text-red-500");
  const respStr = (m: number | null) => (m === null ? "—" : m < 60 ? `${m.toFixed(0)} דק'` : `${(m / 60).toFixed(1)} ש'`);

  return (
    <div dir="rtl" className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0E2233]">ביצועי ערוצים · שלב א'</h1>
        <p className="text-sm text-gray-500 mt-1">
          30 יום · {totals.leads} לידים · {totals.hired} גיוסים ({totals.leads ? Math.round((totals.hired / totals.leads) * 100) : 0}%)
          · מטרה: לראות את זמן התגובה יורד וההמרה עולה ככל שגובגט עונה ראשונה
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="bg-sky-50 text-sky-800 text-xs text-right">
              <th className="px-4 py-3 font-semibold">מקור</th>
              <th className="px-4 py-3 font-semibold">לידים</th>
              <th className="px-4 py-3 font-semibold">זמן תגובה חציוני</th>
              <th className="px-4 py-3 font-semibold">הגיעו לראיון</th>
              <th className="px-4 py-3 font-semibold">גיוסים</th>
              <th className="px-4 py-3 font-semibold">המרה</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const conv = r.leads ? Math.round((r.hired / r.leads) * 100) : 0;
              const m = med(r.resp);
              return (
                <tr key={r.source} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 font-medium text-[#0E2233]">{r.source}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.leads}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${m !== null && m < 5 ? "text-green-600 font-semibold" : "text-gray-600"}`}>{respStr(m)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-600">{r.interview}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.hired}</td>
                  <td className={`px-4 py-2.5 tabular-nums font-bold ${convClass(conv)}`}>{conv}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-sm text-sky-900">
        <b>איך לקרוא:</b> עמודת <b>זמן תגובה</b> אמורה לצנוח לכיוון דקות ככל שגובגט עונה ראשונה. אם ערוץ עם המרה נמוכה (אדום)
        מתחיל להראות תגובה מהירה — עקוב אחרי ההמרה שלו בשבועיים הקרובים. אם היא עולה → הערוץ לא היה רע, רק איטי. אם נשארת נמוכה
        גם עם מענה מהיר → זה ערוץ לחתוך (שלב ג').
      </div>

      <p className="text-xs text-gray-400 text-center pt-2 border-t border-gray-100">
        מתעדכן בכל טעינה · חלון 30 יום · המרה = גיוסים / לידים
      </p>
    </div>
  );
}
