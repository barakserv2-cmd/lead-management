import { notFound } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { Lead } from "@/types/leads";
import { LeadDetail } from "./lead-detail";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: lead, error }, { data: { user } }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).single(),
    supabase.auth.getUser(),
  ]);

  if (error || !lead) {
    notFound();
  }

  // תיעוד צפייה ברשומה (תקנה 10) — נכתב אחרי שהתגובה נשלחה, לא מעכב רינדור
  after(() =>
    logAudit({
      action: "view",
      leadId: id,
      actor: user?.email ?? "anonymous",
      meta: { path: `/leads/${id}` },
    })
  );

  return <LeadDetail lead={lead as Lead} />;
}
