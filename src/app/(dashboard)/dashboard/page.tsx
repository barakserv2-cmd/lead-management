import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { LeadsPerDayChart, LeadsBySourceChart } from "./charts";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Leads per day — last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const since = sevenDaysAgo.toISOString().split("T")[0];

  // All dashboard queries run concurrently — one round-trip of wall time, not nine.
  const statusCount = (status: string) =>
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", status);

  const [
    { count: totalCount },
    { count: newCount },
    { count: contactedCount },
    { count: screeningCount },
    { count: interviewBookedCount },
    { count: hiredCount },
    { count: rejectedCount },
    { count: notAcceptedCount },
    { data: recentLeads },
    { data: allLeads },
  ] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }),
    statusCount(LEAD_STATUSES.NEW_LEAD),
    statusCount(LEAD_STATUSES.CONTACTED),
    statusCount(LEAD_STATUSES.SCREENING_IN_PROGRESS),
    statusCount(LEAD_STATUSES.INTERVIEW_BOOKED),
    statusCount(LEAD_STATUSES.HIRED),
    statusCount(LEAD_STATUSES.REJECTED),
    statusCount(LEAD_STATUSES.NOT_ACCEPTED),
    supabase.from("leads").select("created_at").gte("created_at", since).limit(5000),
    // בלי limit מפורש PostgREST חותך ל-1,000 — והפאי הציג רבע מהלידים
    supabase.from("leads").select("source").limit(10000),
  ]);

  // חלוקת הימים לפי לוח ישראל — created_at הוא UTC אמיתי, וליד של
  // 23:00 בערב שייך להיום הישראלי, לא ליום ה-UTC
  const israelDay = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
  const dayCountsMap: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    dayCountsMap[israelDay(d)] = 0;
  }
  for (const lead of recentLeads ?? []) {
    const day = israelDay(new Date(lead.created_at));
    if (day in dayCountsMap) dayCountsMap[day]++;
  }
  const leadsPerDay = Object.entries(dayCountsMap).map(([date, count]) => ({
    day: new Date(date).toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "numeric" }),
    count,
  }));

  // Leads by source
  const sourceMap: Record<string, number> = {};
  for (const lead of allLeads ?? []) {
    const src = lead.source || "אחר";
    sourceMap[src] = (sourceMap[src] || 0) + 1;
  }
  const leadsBySource = Object.entries(sourceMap)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  const cards = [
    { label: "סה״כ לידים", value: totalCount ?? 0, dot: "bg-purple-500" },
    { label: STATUS_LABELS[LEAD_STATUSES.NEW_LEAD], value: newCount ?? 0, dot: "bg-blue-500" },
    { label: STATUS_LABELS[LEAD_STATUSES.CONTACTED], value: contactedCount ?? 0, dot: "bg-cyan-500" },
    { label: STATUS_LABELS[LEAD_STATUSES.SCREENING_IN_PROGRESS], value: screeningCount ?? 0, dot: "bg-orange-500" },
    { label: STATUS_LABELS[LEAD_STATUSES.INTERVIEW_BOOKED], value: interviewBookedCount ?? 0, dot: "bg-purple-500" },
    { label: STATUS_LABELS[LEAD_STATUSES.HIRED], value: hiredCount ?? 0, dot: "bg-green-500" },
    { label: STATUS_LABELS[LEAD_STATUSES.NOT_ACCEPTED], value: notAcceptedCount ?? 0, dot: "bg-pink-500" },
    { label: STATUS_LABELS[LEAD_STATUSES.REJECTED], value: rejectedCount ?? 0, dot: "bg-gray-500" },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 tracking-tight mb-1">דשבורד</h1>
      <p className="text-sm text-gray-500 mb-6">סיכום פעילות הגיוס</p>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500">
              <span className={`w-1.5 h-1.5 rounded-full ${card.dot}`} />
              {card.label}
            </p>
            <p className="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums mt-1.5">
              {card.value.toLocaleString("he-IL")}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <LeadsPerDayChart data={leadsPerDay} />
        <LeadsBySourceChart data={leadsBySource} />
      </div>
    </div>
  );
}
