import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { JobWithClient } from "@/types/jobs";
import type { Client } from "@/types/clients";
import { LeadStatus } from "@/lib/stateMachine";
import { JobsContent, type JobStaffing, type StaffedLead } from "./jobs-content";

export const dynamic = "force-dynamic";

// ------------------------------------------------------------
// Staffing is computed LIVE from leads — jobs.assigned_count is a dead
// column (nothing writes it). A lead counts toward a job when:
//   hired:      status HIRED/STARTED and hired_job_id = job  (or, for older
//               rows, hired_client + hired_position match by name)
//   in process: status FIT_FOR_INTERVIEW / INTERVIEW_BOOKED / ARRIVED and
//               hired_job_id = job, or hired_client + hired_position match.
//               Leads with an employer but NO position are "pending
//               placement" at the employer level (pendingByClient) so one
//               lead is never counted once per job.
// ------------------------------------------------------------

const HIRED_STATUSES = [LeadStatus.HIRED, LeadStatus.STARTED] as string[];
const PROCESS_STATUSES = [
  LeadStatus.FIT_FOR_INTERVIEW,
  LeadStatus.INTERVIEW_BOOKED,
  LeadStatus.ARRIVED,
] as string[];

interface LeadRow {
  id: string;
  name: string | null;
  status: string;
  hired_job_id: string | null;
  hired_client: string | null;
  hired_position: string | null;
  start_date: string | null;
  interview_date: string | null;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export default async function JobsPage() {
  const supabase = await createClient();
  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [jobsResult, clientsResult, leadsResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, clients(name, phone)")
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, name")
      .eq("status", "Active")
      .order("name", { ascending: true }),
    admin
      .from("leads")
      .select("id, name, status, hired_job_id, hired_client, hired_position, start_date, interview_date")
      .in("status", [...HIRED_STATUSES, ...PROCESS_STATUSES])
      .or("hired_job_id.not.is.null,hired_client.not.is.null"),
  ]);

  const jobs = (jobsResult.data ?? []) as JobWithClient[];
  const leads = (leadsResult.data ?? []) as LeadRow[];

  const staffing: Record<string, JobStaffing> = {};
  const pendingByClient: Record<string, StaffedLead[]> = {};
  const clientNameById = new Map(jobs.map((j) => [j.client_id, norm(j.clients?.name)]));
  for (const [clientId, cname] of clientNameById) {
    if (!cname) continue;
    pendingByClient[clientId] = leads
      .filter((l) => PROCESS_STATUSES.includes(l.status) && !l.hired_job_id && !l.hired_position && norm(l.hired_client) === cname)
      .map((l) => ({ id: l.id, name: l.name ?? "ללא שם", status: l.status, date: l.interview_date ?? null }));
  }
  for (const job of jobs) {
    const hired: StaffedLead[] = [];
    const inProcess: StaffedLead[] = [];
    const clientName = norm(job.clients?.name);
    const title = norm(job.title);
    for (const l of leads) {
      const byId = l.hired_job_id === job.id;
      const sameClient = clientName !== "" && norm(l.hired_client) === clientName;
      const samePos = norm(l.hired_position) === title;
      const row: StaffedLead = {
        id: l.id,
        name: l.name ?? "ללא שם",
        status: l.status,
        date: l.start_date ?? l.interview_date ?? null,
      };
      if (HIRED_STATUSES.includes(l.status)) {
        if (byId || (sameClient && samePos)) hired.push(row);
      } else if (PROCESS_STATUSES.includes(l.status)) {
        if (byId || (sameClient && samePos)) inProcess.push(row);
      }
    }
    staffing[job.id] = { hired, inProcess };
  }

  return (
    <JobsContent
      jobs={jobs}
      staffing={staffing}
      pendingByClient={pendingByClient}
      clients={(clientsResult.data ?? []) as Pick<Client, "id" | "name">[]}
    />
  );
}
