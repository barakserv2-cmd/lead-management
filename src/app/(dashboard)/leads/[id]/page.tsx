import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/types/leads";
import { LeadDetail } from "./lead-detail";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !lead) {
    notFound();
  }

  return <LeadDetail lead={lead as Lead} />;
}
