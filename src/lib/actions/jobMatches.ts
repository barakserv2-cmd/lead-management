"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface JobMatch {
  lead_id: string;
  name: string;
  phone: string | null;
  location: string | null;
  job_title: string | null;
  experience: string | null;
  status: string;
  source: string;
  score: number;
  reasons: string[];
}

/**
 * Top N candidates that fit a given job, ranked by score. Powered by
 * the `match_candidates_for_job` Postgres function.
 */
export async function getJobMatches(jobId: string, limit = 20): Promise<JobMatch[]> {
  const admin = getAdmin();
  const { data, error } = await admin.rpc("match_candidates_for_job", {
    p_job_id: jobId,
    p_limit: limit,
  });
  if (error) {
    console.error("[getJobMatches]", error);
    return [];
  }
  return (data ?? []) as JobMatch[];
}
