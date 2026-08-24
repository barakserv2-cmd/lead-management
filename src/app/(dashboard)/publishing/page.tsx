import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { PublishingContent } from "./publishing-content";

export const dynamic = "force-dynamic";

const ADMIN_ROLE = "אדמין";

/**
 * Thin shell: resolves who is posting (groups are per-recruiter) and hands off.
 * All data loading happens client-side against /api/publishing/*, so the queue
 * can refresh after every "פורסם" without a full RSC round-trip.
 */
export default async function PublishingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const email = user.email.toLowerCase();
  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: profile }, { data: jobs }] = await Promise.all([
    admin.from("user_profiles").select("role, name").ilike("email", email).maybeSingle(),
    admin
      .from("jobs")
      .select("id, title, pay_rate, location, urgent, clients(name)")
      .eq("status", "Open")
      .order("urgent", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <PublishingContent
      userEmail={email}
      userName={profile?.name ?? null}
      isAdmin={profile?.role === ADMIN_ROLE}
      openJobs={
        (jobs ?? []).map((j) => ({
          id: j.id as string,
          title: j.title as string,
          pay_rate: (j.pay_rate as string | null) ?? null,
          location: (j.location as string | null) ?? null,
          urgent: Boolean(j.urgent),
          client_name:
            ((j as { clients?: { name?: string } | null }).clients?.name as string | undefined) ??
            null,
        }))
      }
    />
  );
}
