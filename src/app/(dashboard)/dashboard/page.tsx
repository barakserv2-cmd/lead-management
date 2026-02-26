import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUSES } from "@/lib/constants";
import { LeadsPerDayChart, LeadsBySourceChart } from "./charts";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { count: totalCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true });

  const { count: newCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", LEAD_STATUSES.NEW);

  const { count: followupCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", LEAD_STATUSES.FOLLOWUP);

  const { count: interviewCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", LEAD_STATUSES.INTERVIEW);

  const { count: acceptedCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", LEAD_STATUSES.ACCEPTED);

  const { count: notRelevantCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", LEAD_STATUSES.NOT_RELEVANT);

  // Leads per day — last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const since = sevenDaysAgo.toISOString().split("T")[0];

  const { data: recentLeads } = await supabase
    .from("leads")
    .select("created_at")
    .gte("created_at", since);

  const dayCountsMap: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    dayCountsMap[d.toISOString().split("T")[0]] = 0;
  }
  for (const lead of recentLeads ?? []) {
    const day = lead.created_at.split("T")[0];
    if (day in dayCountsMap) dayCountsMap[day]++;
  }
  const leadsPerDay = Object.entries(dayCountsMap).map(([date, count]) => ({
    day: new Date(date).toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "numeric" }),
    count,
  }));

  // Leads by source
  const { data: allLeads } = await supabase
    .from("leads")
    .select("source");

  const sourceMap: Record<string, number> = {};
  for (const lead of allLeads ?? []) {
    const src = lead.source || "אחר";
    sourceMap[src] = (sourceMap[src] || 0) + 1;
  }
  const leadsBySource = Object.entries(sourceMap)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  const cards = [
    { label: "סה״כ לידים", value: totalCount ?? 0, color: "bg-purple-50 text-purple-700" },
    { label: "חדשים", value: newCount ?? 0, color: "bg-blue-50 text-blue-700" },
    { label: "מעקב", value: followupCount ?? 0, color: "bg-orange-50 text-orange-700" },
    { label: "ראיון במשרד", value: interviewCount ?? 0, color: "bg-purple-50 text-purple-700" },
    { label: "התקבל", value: acceptedCount ?? 0, color: "bg-green-50 text-green-700" },
    { label: "לא רלוונטי", value: notRelevantCount ?? 0, color: "bg-gray-100 text-gray-700" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">דשבורד</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`${card.color} rounded-xl p-6 border`}
          >
            <p className="text-sm font-medium opacity-80">{card.label}</p>
            <p className="text-3xl font-bold mt-2">{card.value}</p>
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
