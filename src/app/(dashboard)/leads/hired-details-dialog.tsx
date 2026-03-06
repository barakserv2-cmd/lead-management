"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getActiveClients, getOpenJobs } from "./actions";

interface ClientOption {
  id: string;
  name: string;
}

interface JobOption {
  id: string;
  title: string;
  client_id: string;
}

interface HiredDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (client: string, position: string) => void;
  loading?: boolean;
}

export function HiredDetailsDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
}: HiredDetailsDialogProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [fetching, setFetching] = useState(false);

  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");

  // Fetch clients and jobs when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFetching(true);

    Promise.all([getActiveClients(), getOpenJobs()]).then(
      ([clientsResult, jobsResult]) => {
        if (cancelled) return;
        setClients(clientsResult.clients as ClientOption[]);
        setJobs(
          (jobsResult.jobs as (JobOption & { clients?: { name: string } })[]).map((j) => ({
            id: j.id,
            title: j.title,
            client_id: j.client_id,
          }))
        );
        setFetching(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset position when client changes
  useEffect(() => {
    setSelectedJobId("");
  }, [selectedClientId]);

  const filteredJobs = selectedClientId
    ? jobs.filter((j) => j.client_id === selectedClientId)
    : [];

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  function handleOpenChange(value: boolean) {
    if (!value) {
      setSelectedClientId("");
      setSelectedJobId("");
    }
    onOpenChange(value);
  }

  function handleConfirm() {
    if (selectedClient && selectedJob) {
      onConfirm(selectedClient.name, selectedJob.title);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>פרטי קבלה לעבודה</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="hired-client">מעסיק *</Label>
            <select
              id="hired-client"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              disabled={fetching}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">{fetching ? "טוען..." : "— בחר מעסיק —"}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hired-position">משרה *</Label>
            <select
              id="hired-position"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              disabled={!selectedClientId || fetching}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {!selectedClientId ? "— בחר מעסיק תחילה —" : filteredJobs.length === 0 ? "— אין משרות פתוחות —" : "— בחר משרה —"}
              </option>
              {filteredJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            ביטול
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedClient || !selectedJob || loading}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? "שומר..." : "אישור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
