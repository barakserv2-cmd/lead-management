"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronLeft,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { JobStatus, JobWithClient } from "@/types/jobs";
import type { Client } from "@/types/clients";
import { STATUS_LABELS, type LeadStatusValue } from "@/lib/stateMachine";
import { createJob, setJobNeeded, setJobStatus, setJobUrgent, updateJob } from "./actions";
import { JobMatchesSheet } from "./job-matches-sheet";

// ── Types shared with page.tsx ──────────────────────────────

export interface StaffedLead {
  id: string;
  name: string;
  status: string;
  date: string | null;
}

export interface JobStaffing {
  hired: StaffedLead[];
  inProcess: StaffedLead[];
}

type StatusTab = "Open" | "On Hold" | "Closed";

const STATUS_TAB_LABELS: Record<StatusTab, string> = {
  Open: "פתוחות",
  "On Hold": "מוקפאות",
  Closed: "סגורות",
};

// ── Helpers ─────────────────────────────────────────────────

function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.startsWith("0") ? "972" + d.slice(1) : d}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────

export function JobsContent({
  jobs,
  staffing,
  clients,
}: {
  jobs: JobWithClient[];
  staffing: Record<string, JobStaffing>;
  clients: Pick<Client, "id" | "name">[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [tab, setTab] = useState<StatusTab>("Open");
  const [search, setSearch] = useState("");
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [onlyUnfilled, setOnlyUnfilled] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const [matchesJob, setMatchesJob] = useState<JobWithClient | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobWithClient | null>(null);
  const [form, setForm] = useState({
    client_id: "",
    title: "",
    needed: "1",
    pay_rate: "",
    location: "",
    requirements: "",
    notes: "",
    urgent: false,
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const stat = (j: JobWithClient) => staffing[j.id] ?? { hired: [], inProcess: [] };
  const missing = (j: JobWithClient) => Math.max(0, j.needed_count - stat(j).hired.length);

  // ── KPIs over OPEN jobs (regardless of tab) ──
  const kpi = useMemo(() => {
    const open = jobs.filter((j) => j.status === "Open");
    return {
      openJobs: open.length,
      missing: open.reduce((s, j) => s + missing(j), 0),
      urgent: open.filter((j) => j.urgent && missing(j) > 0).length,
      inProcess: open.reduce((s, j) => s + stat(j).inProcess.length, 0),
      employers: new Set(open.map((j) => j.client_id)).size,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, staffing]);

  const tabCounts = useMemo(() => {
    const c: Record<StatusTab, number> = { Open: 0, "On Hold": 0, Closed: 0 };
    for (const j of jobs) c[j.status as StatusTab] = (c[j.status as StatusTab] ?? 0) + 1;
    return c;
  }, [jobs]);

  // ── Filter + group by employer ──
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = jobs.filter((j) => {
      if (j.status !== tab) return false;
      if (onlyUrgent && !j.urgent) return false;
      if (onlyUnfilled && missing(j) === 0) return false;
      if (!q) return true;
      return (
        j.title.toLowerCase().includes(q) ||
        j.clients?.name?.toLowerCase().includes(q) ||
        (j.location ?? "").toLowerCase().includes(q) ||
        (j.requirements ?? []).some((r) => r.toLowerCase().includes(q)) ||
        (j.notes ?? "").toLowerCase().includes(q)
      );
    });

    const map = new Map<string, { name: string; phone: string | null; jobs: JobWithClient[] }>();
    for (const j of list) {
      const g = map.get(j.client_id) ?? {
        name: j.clients?.name ?? "ללא מעסיק",
        phone: j.clients?.phone ?? null,
        jobs: [],
      };
      g.jobs.push(j);
      map.set(j.client_id, g);
    }
    const arr = [...map.entries()].map(([id, g]) => {
      const needed = g.jobs.reduce((s, j) => s + j.needed_count, 0);
      const hired = g.jobs.reduce((s, j) => s + stat(j).hired.length, 0);
      const inProcess = g.jobs.reduce((s, j) => s + stat(j).inProcess.length, 0);
      const urgent = g.jobs.some((j) => j.urgent && missing(j) > 0);
      // urgent + unfilled first inside the group
      g.jobs.sort((a, b) => {
        const ua = a.urgent && missing(a) > 0 ? 0 : 1;
        const ub = b.urgent && missing(b) > 0 ? 0 : 1;
        if (ua !== ub) return ua - ub;
        return missing(b) - missing(a);
      });
      return { id, ...g, needed, hired, inProcess, missing: needed - hired, urgent };
    });
    // employers with the most open headcount first
    arr.sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      if (b.missing !== a.missing) return b.missing - a.missing;
      return a.name.localeCompare(b.name, "he");
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, staffing, tab, search, onlyUrgent, onlyUnfilled]);

  const visibleCount = groups.reduce((s, g) => s + g.jobs.length, 0);

  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // ── Quick actions ──
  function act(fn: () => Promise<{ error: string | null }>, ok: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else {
        toast.success(ok);
        router.refresh();
      }
    });
  }

  // ── Dialog ──
  function openAdd(clientId?: string) {
    setEditingJob(null);
    setForm({
      client_id: clientId ?? clients[0]?.id ?? "",
      title: "",
      needed: "1",
      pay_rate: "",
      location: "",
      requirements: "",
      notes: "",
      urgent: false,
    });
    setFormError("");
    setDialogOpen(true);
  }

  function openEdit(job: JobWithClient) {
    setEditingJob(job);
    setForm({
      client_id: job.client_id,
      title: job.title,
      needed: String(job.needed_count),
      pay_rate: job.pay_rate ?? "",
      location: job.location ?? "",
      requirements: (job.requirements ?? []).join(", "),
      notes: job.notes ?? "",
      urgent: job.urgent,
    });
    setFormError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return setFormError("כותרת היא שדה חובה");
    if (!editingJob && !form.client_id) return setFormError("מעסיק הוא שדה חובה");
    const needed = parseInt(form.needed, 10);
    if (isNaN(needed) || needed < 1) return setFormError("מספר תקנים חייב להיות 1 לפחות");
    setFormError("");
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      needed_count: needed,
      pay_rate: form.pay_rate.trim(),
      location: form.location.trim(),
      urgent: form.urgent,
      requirements: form.requirements.split(",").map((s) => s.trim()).filter(Boolean),
      notes: form.notes,
    };
    const r = editingJob
      ? await updateJob(editingJob.id, payload)
      : await createJob({ ...payload, client_id: form.client_id });
    setSaving(false);
    if (r.error) return setFormError(r.error);
    toast.success(editingJob ? "המשרה עודכנה" : "המשרה נוספה");
    setDialogOpen(false);
    setEditingJob(null);
    router.refresh();
  }

  return (
    <div className={pending ? "opacity-70 transition-opacity" : ""}>
      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">משרות</h1>
          <p className="text-sm text-gray-500">
            איוש מחושב חי מהלידים — מי שסומן &quot;התקבל&quot; / &quot;התחיל לעבוד&quot; על המשרה.
          </p>
        </div>
        <Button onClick={() => openAdd()} className="gap-1.5">
          <Plus className="w-4 h-4" />
          משרה חדשה
        </Button>
      </div>

      {/* ═══ KPIs ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Kpi label="משרות פתוחות" value={kpi.openJobs} />
        <Kpi label="תקנים חסרים" value={kpi.missing} tone={kpi.missing > 0 ? "red" : "green"} />
        <Kpi label="דחופות לא מאוישות" value={kpi.urgent} tone={kpi.urgent > 0 ? "amber" : "gray"} />
        <Kpi label="מועמדים בתהליך" value={kpi.inProcess} tone="blue" />
        <Kpi label="מעסיקים עם משרות" value={kpi.employers} />
      </div>

      {/* ═══ Filters ═══ */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="flex rounded-lg border bg-white p-0.5">
          {(Object.keys(STATUS_TAB_LABELS) as StatusTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                tab === t ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {STATUS_TAB_LABELS[t]}
              <span className={`ms-1.5 text-xs ${tab === t ? "text-white/70" : "text-gray-400"}`}>
                {tabCounts[t]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש משרה / מעסיק / דרישה..."
            className="pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Chip active={onlyUrgent} onClick={() => setOnlyUrgent((v) => !v)} tone="amber">
            <AlertTriangle className="w-3.5 h-3.5" /> רק דחופות
          </Chip>
          <Chip active={onlyUnfilled} onClick={() => setOnlyUnfilled((v) => !v)} tone="red">
            <Users className="w-3.5 h-3.5" /> רק לא מאוישות
          </Chip>
          {groups.length > 1 && (
            <button
              onClick={() =>
                setCollapsed(collapsed.size ? new Set() : new Set(groups.map((g) => g.id)))
              }
              className="text-xs text-gray-500 hover:text-gray-800 px-2"
            >
              {collapsed.size ? "פתח הכל" : "כווץ הכל"}
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-2">
        {visibleCount} משרות אצל {groups.length} מעסיקים
      </p>

      {/* ═══ Groups ═══ */}
      {groups.length === 0 ? (
        <div className="bg-white border rounded-xl p-12 text-center text-gray-500">
          אין משרות שמתאימות לסינון.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.id);
            const wa = waLink(g.phone);
            return (
              <section key={g.id} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                {/* Employer header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/80 border-b">
                  <button onClick={() => toggleGroup(g.id)} className="flex items-center gap-2 min-w-0">
                    {isCollapsed ? (
                      <ChevronLeft className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                    <Building2 className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="font-semibold text-gray-800 truncate">{g.name}</span>
                  </button>
                  <span className="text-xs text-gray-500">{g.jobs.length} משרות</span>

                  <div className="ms-auto flex items-center gap-2 text-xs">
                    <StaffPill hired={g.hired} needed={g.needed} />
                    {g.inProcess > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {g.inProcess} בתהליך
                      </span>
                    )}
                    {g.urgent && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                        דחוף
                      </span>
                    )}
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="text-green-600 hover:text-green-700"
                        title="וואטסאפ למעסיק"
                      >
                        <WhatsAppIcon />
                      </a>
                    )}
                    <button
                      onClick={() => openAdd(g.id)}
                      className="text-gray-400 hover:text-gray-700"
                      title="הוסף משרה למעסיק"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Rows */}
                {!isCollapsed && (
                  <div className="divide-y">
                    {g.jobs.map((job) => {
                      const s = stat(job);
                      const miss = missing(job);
                      const expanded = expandedJob === job.id;
                      return (
                        <div key={job.id} className={job.urgent && miss > 0 ? "bg-amber-50/40" : ""}>
                          <div className="grid grid-cols-12 items-center gap-2 px-4 py-2.5">
                            {/* Title + meta */}
                            <div className="col-span-12 md:col-span-5 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <button
                                  onClick={() => act(() => setJobUrgent(job.id, !job.urgent), job.urgent ? "הוסר סימון דחוף" : "סומן דחוף")}
                                  title={job.urgent ? "בטל דחוף" : "סמן דחוף"}
                                  className={job.urgent ? "text-amber-500" : "text-gray-300 hover:text-amber-400"}
                                >
                                  <AlertTriangle className="w-4 h-4" />
                                </button>
                                <span className="font-medium text-gray-900 truncate">{job.title}</span>
                                {job.location && (
                                  <span className="text-xs text-gray-400 truncate">· {job.location}</span>
                                )}
                              </div>
                              {(job.requirements?.length > 0 || job.notes) && (
                                <div className="flex flex-wrap gap-1 mt-1 ps-6">
                                  {job.requirements?.map((r) => (
                                    <span key={r} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                      {r}
                                    </span>
                                  ))}
                                  {job.notes &&
                                    job.notes.split("|").map((n) => n.trim()).filter(Boolean).map((n) => (
                                      <span key={n} className="text-[11px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">
                                        {n}
                                      </span>
                                    ))}
                                </div>
                              )}
                            </div>

                            {/* Pay */}
                            <div className="col-span-4 md:col-span-2 text-sm text-gray-700" dir="ltr">
                              {job.pay_rate ? (
                                <span className="font-mono">{/^\d/.test(job.pay_rate) ? `₪${job.pay_rate}` : job.pay_rate}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </div>

                            {/* Staffing */}
                            <div className="col-span-5 md:col-span-3">
                              <button
                                onClick={() => setExpandedJob(expanded ? null : job.id)}
                                className="w-full text-right"
                                title="הצג מועמדים"
                              >
                                <div className="flex items-center gap-2">
                                  <StaffPill hired={s.hired.length} needed={job.needed_count} />
                                  {s.inProcess.length > 0 && (
                                    <span className="text-[11px] text-blue-700">+{s.inProcess.length} בתהליך</span>
                                  )}
                                </div>
                                <div className="h-1.5 mt-1 rounded-full bg-gray-100 overflow-hidden flex">
                                  <div
                                    className="h-full bg-emerald-500"
                                    style={{ width: `${Math.min(100, (s.hired.length / job.needed_count) * 100)}%` }}
                                  />
                                  <div
                                    className="h-full bg-blue-300"
                                    style={{
                                      width: `${Math.min(
                                        100 - Math.min(100, (s.hired.length / job.needed_count) * 100),
                                        (s.inProcess.length / job.needed_count) * 100
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </button>
                            </div>

                            {/* Actions */}
                            <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-1">
                              <div className="hidden md:flex items-center border rounded-md">
                                <button
                                  className="px-1.5 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                                  disabled={job.needed_count <= 1}
                                  onClick={() => act(() => setJobNeeded(job.id, job.needed_count - 1), "תקן הופחת")}
                                  title="הפחת תקן"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="px-1 text-xs text-gray-600 tabular-nums">{job.needed_count}</span>
                                <button
                                  className="px-1.5 py-1 text-gray-500 hover:bg-gray-100"
                                  onClick={() => act(() => setJobNeeded(job.id, job.needed_count + 1), "תקן נוסף")}
                                  title="הוסף תקן"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <IconBtn title="מועמדים מתאימים" onClick={() => setMatchesJob(job)}>
                                <Users className="w-4 h-4" />
                              </IconBtn>
                              <IconBtn title="עריכה" onClick={() => openEdit(job)}>
                                <Pencil className="w-4 h-4" />
                              </IconBtn>
                              {job.status === "Open" ? (
                                <IconBtn title="הקפא משרה" onClick={() => act(() => setJobStatus(job.id, "On Hold"), "המשרה הוקפאה")}>
                                  <Pause className="w-4 h-4" />
                                </IconBtn>
                              ) : (
                                <IconBtn title="פתח מחדש" onClick={() => act(() => setJobStatus(job.id, "Open"), "המשרה נפתחה מחדש")}>
                                  <Play className="w-4 h-4" />
                                </IconBtn>
                              )}
                              {job.status !== "Closed" && (
                                <IconBtn
                                  title="סגור משרה"
                                  onClick={() => {
                                    if (confirm(`לסגור את המשרה "${job.title}" אצל ${g.name}?`))
                                      act(() => setJobStatus(job.id, "Closed" as JobStatus), "המשרה נסגרה");
                                  }}
                                >
                                  <X className="w-4 h-4" />
                                </IconBtn>
                              )}
                            </div>
                          </div>

                          {/* Expanded: who is on this job */}
                          {expanded && (
                            <div className="px-4 pb-3 ps-10 grid md:grid-cols-2 gap-3 text-sm">
                              <LeadList title="מאוישים" leads={s.hired} empty="עדיין אף אחד לא התקבל למשרה" tone="emerald" />
                              <LeadList title="בתהליך" leads={s.inProcess} empty="אין מועמדים בתהליך" tone="blue" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* ═══ Matches sheet ═══ */}
      <JobMatchesSheet
        open={!!matchesJob}
        jobId={matchesJob?.id ?? null}
        jobTitle={matchesJob?.title ?? ""}
        clientName={matchesJob?.clients?.name ?? ""}
        onOpenChange={(o) => !o && setMatchesJob(null)}
      />

      {/* ═══ Add / Edit dialog ═══ */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingJob(null); }}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingJob ? "עריכת משרה" : "משרה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {!editingJob && (
              <div className="grid gap-1.5">
                <Label htmlFor="job-client">מעסיק *</Label>
                <select
                  id="job-client"
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  className="h-9 rounded-md border px-3 text-sm bg-white"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="job-title">תפקיד *</Label>
              <Input id="job-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="job-needed">תקנים *</Label>
                <Input id="job-needed" type="number" min={1} value={form.needed} onChange={(e) => setForm({ ...form, needed: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="job-pay">שכר</Label>
                <Input id="job-pay" placeholder="45 / 40+2" value={form.pay_rate} onChange={(e) => setForm({ ...form, pay_rate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="job-location">מיקום</Label>
                <Input id="job-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="job-req">דרישות (מופרדות בפסיק)</Label>
              <Input id="job-req" placeholder="אנגלית טובה, ניסיון" value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="job-notes">הערות (מגורים / בונוסים / שבת — מופרד ב-|)</Label>
              <Input id="job-notes" placeholder="מגורים: יש | כולל שבת" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.urgent} onChange={(e) => setForm({ ...form, urgent: e.target.checked })} />
              דחוף
            </label>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingJob(null); }} disabled={saving}>
              ביטול
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "שומר..." : editingJob ? "שמור" : "הוסף משרה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Small parts ─────────────────────────────────────────────

function Kpi({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: number;
  tone?: "gray" | "red" | "amber" | "green" | "blue";
}) {
  const tones = {
    gray: "text-gray-900",
    red: "text-red-600",
    amber: "text-amber-600",
    green: "text-emerald-600",
    blue: "text-blue-600",
  };
  return (
    <div className="bg-white border rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "amber" | "red";
  children: React.ReactNode;
}) {
  const on = tone === "amber" ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-red-100 text-red-800 border-red-200";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-full border transition-colors ${
        active ? on : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function StaffPill({ hired, needed }: { hired: number; needed: number }) {
  const full = hired >= needed;
  const none = hired === 0;
  const cls = full
    ? "bg-emerald-100 text-emerald-800"
    : none
      ? "bg-red-100 text-red-700"
      : "bg-orange-100 text-orange-800";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ${cls}`}>
      {hired} / {needed} מאוישים
    </span>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-md text-gray-400 hover:text-gray-800 hover:bg-gray-100"
    >
      {children}
    </button>
  );
}

function LeadList({
  title,
  leads,
  empty,
  tone,
}: {
  title: string;
  leads: StaffedLead[];
  empty: string;
  tone: "emerald" | "blue";
}) {
  const dot = tone === "emerald" ? "bg-emerald-500" : "bg-blue-400";
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 mb-1">{title}</div>
      {leads.length === 0 ? (
        <p className="text-xs text-gray-400">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {leads.map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              <Link href={`/leads/${l.id}`} className="text-gray-800 hover:underline">
                {l.name}
              </Link>
              <span className="text-xs text-gray-400">
                {STATUS_LABELS[l.status as LeadStatusValue] ?? l.status}
                {l.date ? ` · ${fmtDate(l.date)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
