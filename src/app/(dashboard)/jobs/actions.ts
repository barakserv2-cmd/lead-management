"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getJobs() {
  const { data, error } = await getSupabase()
    .from("jobs")
    .select("*, clients(name, phone)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { jobs: [], error: error.message };
  return { jobs: data ?? [], error: null };
}

export async function createJob(job: {
  client_id: string;
  title: string;
  needed_count: number;
  pay_rate: string;
  location: string;
  urgent: boolean;
}) {
  const { data, error } = await getSupabase()
    .from("jobs")
    .insert({
      client_id: job.client_id,
      title: job.title,
      needed_count: job.needed_count,
      pay_rate: job.pay_rate || null,
      location: job.location || null,
      urgent: job.urgent,
    })
    .select("*, clients(name, phone)")
    .single();

  if (error) {
    return { job: null, error: error.message };
  }

  revalidatePath("/jobs");
  return { job: data, error: null };
}

export async function updateJob(
  id: string,
  job: {
    title: string;
    needed_count: number;
    pay_rate: string;
    location: string;
    urgent: boolean;
  }
) {
  const { data, error } = await getSupabase()
    .from("jobs")
    .update({
      title: job.title,
      needed_count: job.needed_count,
      pay_rate: job.pay_rate || null,
      location: job.location || null,
      urgent: job.urgent,
    })
    .eq("id", id)
    .select("*, clients(name, phone)")
    .single();

  if (error) {
    return { job: null, error: error.message };
  }

  revalidatePath("/jobs");
  return { job: data, error: null };
}
