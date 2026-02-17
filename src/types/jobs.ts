export type JobStatus = "Open" | "Closed" | "On Hold";

export interface Job {
  id: string;
  client_id: string;
  title: string;
  needed_count: number;
  assigned_count: number;
  pay_rate: string | null;
  location: string | null;
  requirements: string[];
  urgent: boolean;
  status: JobStatus;
  notes: string | null;
  created_at: string;
}

export interface JobWithClient extends Job {
  clients: {
    name: string;
    phone: string;
  };
}
