import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUSES } from "@/lib/constants";
import type { Lead } from "@/types/leads";
import { HiredContent } from "./hired-content";

export default async function HiredReportPage() {
  const supabase = await createClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("status", LEAD_STATUSES.INTERVIEW_BOOKED)
    .order("created_at", { ascending: false });

  const typedLeads = (leads ?? []) as Lead[];

  return (
    <div>
      <HiredContent leads={typedLeads} />
    </div>
  );
}
