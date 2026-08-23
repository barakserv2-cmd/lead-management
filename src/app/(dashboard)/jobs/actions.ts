"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import type { JobStatus } from "@/types/jobs";

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
    .order("created_at", { ascending: false });

  if (error) return { jobs: [], error: error.message };
  return { jobs: data ?? [], error: null };
}

interface JobInput {
  title: string;
  needed_count: number;
  pay_rate: string;
  location: string;
  urgent: boolean;
  requirements?: string[];
  notes?: string;
}

function toRow(job: JobInput) {
  return {
    title: job.title,
    needed_count: job.needed_count,
    pay_rate: job.pay_rate || null,
    location: job.location || null,
    urgent: job.urgent,
    requirements: job.requirements ?? [],
    notes: job.notes?.trim() || null,
  };
}

export async function createJob(job: JobInput & { client_id: string }) {
  const { data, error } = await getSupabase()
    .from("jobs")
    .insert({ client_id: job.client_id, ...toRow(job) })
    .select("*, clients(name, phone)")
    .single();

  if (error) return { job: null, error: error.message };
  revalidatePath("/jobs");
  return { job: data, error: null };
}

export async function updateJob(id: string, job: JobInput) {
  const { data, error } = await getSupabase()
    .from("jobs")
    .update(toRow(job))
    .eq("id", id)
    .select("*, clients(name, phone)")
    .single();

  if (error) return { job: null, error: error.message };
  revalidatePath("/jobs");
  return { job: data, error: null };
}

/** Open / On Hold / Closed — quick action from the board. */
export async function setJobStatus(id: string, status: JobStatus) {
  const { error } = await getSupabase().from("jobs").update({ status }).eq("id", id);
  if (!error) revalidatePath("/jobs");
  return { error: error?.message ?? null };
}

export async function setJobUrgent(id: string, urgent: boolean) {
  const { error } = await getSupabase().from("jobs").update({ urgent }).eq("id", id);
  if (!error) revalidatePath("/jobs");
  return { error: error?.message ?? null };
}

/** Bump the headcount by ±1 straight from the row. */
export async function setJobNeeded(id: string, needed_count: number) {
  if (needed_count < 1) return { error: "לפחות תקן אחד" };
  const { error } = await getSupabase().from("jobs").update({ needed_count }).eq("id", id);
  if (!error) revalidatePath("/jobs");
  return { error: error?.message ?? null };
}
