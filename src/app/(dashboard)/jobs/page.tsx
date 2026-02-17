import { createClient } from "@/lib/supabase/server";
import type { JobWithClient } from "@/types/jobs";
import type { Client } from "@/types/clients";
import { JobsContent } from "./jobs-content";

export default async function JobsPage() {
  const supabase = await createClient();

  const [jobsResult, clientsResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, clients(name, phone)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("clients")
      .select("id, name")
      .eq("status", "Active")
      .order("name", { ascending: true }),
  ]);

  return (
    <JobsContent
      jobs={(jobsResult.data ?? []) as JobWithClient[]}
      clients={(clientsResult.data ?? []) as Pick<Client, "id" | "name">[]}
    />
  );
}
