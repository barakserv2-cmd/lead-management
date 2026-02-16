import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/types/leads";
import { LeadsContent } from "./leads-content";

export default async function LeadsPage() {
  const supabase = await createClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const typedLeads = (leads ?? []) as Lead[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">לידים</h1>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="חיפוש..."
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>
      <LeadsContent leads={typedLeads} />
    </div>
  );
}
