import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUSES } from "@/lib/constants";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { count: totalCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true });

  const { count: newCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", LEAD_STATUSES.NEW);

  const { count: screeningCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", LEAD_STATUSES.SCREENING);

  const { count: qualifiedCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", LEAD_STATUSES.QUALIFIED);

  const { count: placedCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", LEAD_STATUSES.PLACED);

  const cards = [
    { label: "סה״כ לידים", value: totalCount ?? 0, color: "bg-purple-50 text-purple-700" },
    { label: "לידים חדשים", value: newCount ?? 0, color: "bg-blue-50 text-blue-700" },
    { label: "בסינון", value: screeningCount ?? 0, color: "bg-yellow-50 text-yellow-700" },
    { label: "מתאימים", value: qualifiedCount ?? 0, color: "bg-green-50 text-green-700" },
    { label: "הושמו", value: placedCount ?? 0, color: "bg-emerald-50 text-emerald-700" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">דשבורד</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
    </div>
  );
}
