import { notFound } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import type { Lead } from "@/types/leads";
import { LeadDetail } from "./lead-detail";
import { buildGubgetSnapshot } from "./gubget-summary";

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

  // שם הרכזת המטפלת — handled_by הוא אימייל; user_profiles נקרא רק דרך
  // service role (אין policy ל-authenticated), כמו בדף "לידים של היום".
  let recruiterName: string | null = null;
  if ((lead as Lead).handled_by) {
    const { data: profile } = await getSupabaseAdmin()
      .from("user_profiles")
      .select("name")
      .eq("email", (lead as Lead).handled_by)
      .maybeSingle();
    recruiterName = profile?.name ?? null;
  }

  // ההערה האחרונה שגובגט כתב ביומן — ממנה בנויה שורת "מה גובגט יודע".
  // lead_events נקרא דרך לקוח המשתמש (יש policy ל-authenticated).
  const { data: gubgetNote } = await supabase
    .from("lead_events")
    .select("event_text, created_at")
    .eq("lead_id", id)
    .eq("event_type", "גובגט")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const machine = buildGubgetSnapshot(lead as Lead, gubgetNote ?? null);

  // תיעוד צפייה ברשומה (תקנה 10) — נכתב אחרי שהתגובה נשלחה, לא מעכב רינדור
  after(() =>
    logAudit({
      action: "view",
      leadId: id,
      actor: user?.email ?? "anonymous",
      meta: { path: `/leads/${id}` },
    })
  );

  return <LeadDetail lead={lead as Lead} recruiterName={recruiterName} machine={machine} />;
}
