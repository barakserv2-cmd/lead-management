"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { JobWithClient } from "@/types/jobs";
import type { Client } from "@/types/clients";
import { createJob } from "./actions";

// ── Constants ────────────────────────────────────────────────

type FilterKey = "all" | "unstaffed" | "urgent";

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "unstaffed", label: "ללא איוש" },
  { key: "urgent", label: "דחוף" },
];

// ── Helpers ──────────────────────────────────────────────────

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "972");
}

function getStaffingColor(assigned: number, needed: number): string {
  if (assigned === 0) return "bg-red-500 text-white";
  if (assigned < needed) return "bg-yellow-500 text-white";
  return "bg-emerald-500 text-white";
}

// ── Icons ────────────────────────────────────────────────────

function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function PlusIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────

export function JobsContent({
  jobs: initialJobs,
  clients,
}: {
  jobs: JobWithClient[];
  clients: Pick<Client, "id" | "name">[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [addOpen, setAddOpen] = useState(false);

  // Add form state
  const [formClientId, setFormClientId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formNeeded, setFormNeeded] = useState("1");
  const [formPayRate, setFormPayRate] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formUrgent, setFormUrgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Filter + search
  const filtered = useMemo(() => {
    let result = initialJobs;

    if (activeFilter === "unstaffed") {
      result = result.filter((j) => j.assigned_count === 0);
    } else if (activeFilter === "urgent") {
      result = result.filter((j) => j.urgent);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          (j.location?.toLowerCase().includes(q) ?? false) ||
          j.clients.name.toLowerCase().includes(q)
      );
    }

    return result;
  }, [initialJobs, activeFilter, search]);

  function openAddDialog() {
    setFormClientId(clients[0]?.id ?? "");
    setFormTitle("");
    setFormNeeded("1");
    setFormPayRate("");
    setFormLocation("");
    setFormUrgent(false);
    setFormError("");
    setAddOpen(true);
  }

  async function handleAdd() {
    if (!formClientId || !formTitle.trim()) {
      setFormError("לקוח וכותרת הם שדות חובה");
      return;
    }
    const neededNum = parseInt(formNeeded, 10);
    if (isNaN(neededNum) || neededNum < 1) {
      setFormError("מספר עובדים חייב להיות 1 לפחות");
      return;
    }
    setFormError("");
    setSaving(true);
    const result = await createJob({
      client_id: formClientId,
      title: formTitle.trim(),
      needed_count: neededNum,
      pay_rate: formPayRate.trim(),
      location: formLocation.trim(),
      urgent: formUrgent,
    });
    setSaving(false);
    if (result.error) {
      setFormError(result.error);
    } else {
      toast.success("משרה נוספה בהצלחה!");
      setAddOpen(false);
      router.refresh();
    }
  }

  return (
    <div>
      {/* ═══ HEADER ═══════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">משרות</h1>
        <div className="flex items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש כותרת / מיקום..."
            className="w-64 text-sm"
          />
          <Button onClick={openAddDialog} className="gap-1.5">
            <PlusIcon className="w-4 h-4" />
            משרה חדשה
          </Button>
        </div>
      </div>

      {/* ═══ FILTER TABS ══════════════════════════════════════ */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveFilter(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeFilter === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.key !== "all" && (
              <span className="mr-1.5 text-xs text-gray-400">
                ({tab.key === "unstaffed"
                  ? initialJobs.filter((j) => j.assigned_count === 0).length
                  : initialJobs.filter((j) => j.urgent).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ CARD GRID ════════════════════════════════════════ */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📋</span>
          </div>
          <p className="text-gray-500 font-medium">
            {search ? "לא נמצאו תוצאות" : "אין משרות עדיין"}
          </p>
          {!search && (
            <Button onClick={openAddDialog} variant="outline" className="mt-4 gap-1.5">
              <PlusIcon className="w-4 h-4" />
              הוסף משרה ראשונה
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {/* ═══ ADD JOB DIALOG ═══════════════════════════════════ */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת משרה חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="job-client">לקוח *</Label>
              <select
                id="job-client"
                value={formClientId}
                onChange={(e) => setFormClientId(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="" disabled>בחר לקוח...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-title">כותרת המשרה *</Label>
              <Input
                id="job-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="מלצר/ית, עובד/ת ניקיון..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="job-needed">מספר עובדים *</Label>
                <Input
                  id="job-needed"
                  type="number"
                  min="1"
                  value={formNeeded}
                  onChange={(e) => setFormNeeded(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-pay">שכר</Label>
                <Input
                  id="job-pay"
                  value={formPayRate}
                  onChange={(e) => setFormPayRate(e.target.value)}
                  placeholder='45 ש"ח/שעה'
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-location">מיקום</Label>
              <Input
                id="job-location"
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="אילת, מלון..."
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={formUrgent}
                onClick={() => setFormUrgent(!formUrgent)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formUrgent ? "bg-red-500" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formUrgent ? "translate-x-1" : "translate-x-6"
                  }`}
                />
              </button>
              <Label>דחוף</Label>
            </div>
            {formError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 font-medium">
                {formError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              ביטול
            </Button>
            <Button
              onClick={handleAdd}
              disabled={saving || !formClientId || !formTitle.trim()}
            >
              {saving ? "שומר..." : "הוסף משרה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Job Card ────────────────────────────────────────────────

function JobCard({ job }: { job: JobWithClient }) {
  const clientPhone = formatPhone(job.clients.phone);
  const staffingColor = getStaffingColor(job.assigned_count, job.needed_count);

  return (
    <div className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow">
      {/* Header: Title + Client Name */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 truncate">
              {job.title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {job.clients.name}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {job.urgent && (
              <Badge className="bg-red-100 text-red-700 text-[11px]">
                דחוף
              </Badge>
            )}
            <Badge className={`text-[11px] ${staffingColor}`}>
              {job.assigned_count} / {job.needed_count} עובדים
            </Badge>
          </div>
        </div>

        {/* Details: Location · Pay Rate */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {job.location && (
            <span className="text-xs text-gray-400">{job.location}</span>
          )}
          {job.location && job.pay_rate && (
            <span className="text-gray-200">·</span>
          )}
          {job.pay_rate && (
            <span className="text-xs text-gray-400">{job.pay_rate}</span>
          )}
        </div>

        {/* Requirements Tags */}
        {job.requirements.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {job.requirements.map((req, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] rounded-full"
              >
                {req}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions Row */}
      <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
        <button
          type="button"
          disabled
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-50 text-blue-400 text-xs font-medium cursor-not-allowed"
          title="בקרוב - התאמת עובדים"
        >
          התאם עובדים
        </button>
        <button
          type="button"
          disabled
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-50 text-gray-400 text-xs font-medium cursor-not-allowed"
          title="בקרוב - שיבוץ"
        >
          שבץ
        </button>
        {clientPhone && (
          <button
            type="button"
            onClick={() => {
              setTimeout(() => {
                window.open(
                  "https://api.whatsapp.com/send?phone=" + clientPhone,
                  "_blank",
                  "noopener,noreferrer"
                );
              }, 100);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors"
          >
            <WhatsAppIcon className="w-3.5 h-3.5" />
            WhatsApp
          </button>
        )}
      </div>
    </div>
  );
}
