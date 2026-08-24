"use client";

import { useMemo, useState } from "react";
import { LeadNotesDialog } from "../leads/lead-notes-dialog";
import { InterviewMessageDialog } from "./interview-message-dialog";
import Link from "next/link";
import { STATUS_LABELS, LeadStatus, type LeadStatusValue } from "@/lib/stateMachine";
import { StatusSelect } from "../leads/status-select";

export interface InterviewRow {
  id: string;
  name: string;
  phone: string | null;
  job_title: string | null;
  location: string | null;
  status: LeadStatusValue;
  interview_date: string; // ISO
  interview_type: "in_person" | "video" | null;
  interview_notes: string | null;
  rejection_reason: string | null;
  client: string | null;
  recruiter: string | null;
  source: string | null;
}

const TZ = "Asia/Jerusalem";

function ilDateKey(iso: string): string {
  // YYYY-MM-DD in Israel time
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
function ilTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}
function ilDayLabel(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  return d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
}
function todayKey(): string {
  return ilDateKey(new Date().toISOString());
}
function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ilDateKey(d.toISOString());
}
function normPhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}

// The only statuses selectable from the interviews board.
const INTERVIEW_STATUSES: LeadStatusValue[] = [
  LeadStatus.INTERVIEW_BOOKED,
  LeadStatus.ARRIVED,
  LeadStatus.HIRED,
  LeadStatus.NO_SHOW,
  LeadStatus.REJECTED,
  LeadStatus.LOST_CONTACT,
];

type Range = "today" | "yesterday" | "tomorrow" | "week" | "upcoming" | "past" | "all";

const RANGE_LABELS: Record<Range, string> = {
  today: "היום",
  yesterday: "אתמול",
  tomorrow: "מחר",
  week: "7 ימים",
  upcoming: "כל הקרובים",
  past: "עברו",
  all: "הכל",
};

export function InterviewsContent({ rows }: { rows: InterviewRow[] }) {
  const [range, setRange] = useState<Range>("upcoming");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [client, setClient] = useState("");
  const [recruiter, setRecruiter] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  const today = todayKey();
  const [reportDate, setReportDate] = useState(today);

  const roleOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.job_title).filter((x): x is string => !!x))).sort(), [rows]);
  const clientOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.client).filter((x): x is string => !!x))).sort(), [rows]);
  const recruiterOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.recruiter).filter((x): x is string => !!x))).sort(), [rows]);

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return rows.filter((r) => {
      const key = ilDateKey(r.interview_date);
      if (range === "today" && key !== today) return false;
      if (range === "yesterday" && key !== addDays(today, -1)) return false;
      if (range === "tomorrow" && key !== addDays(today, 1)) return false;
      if (range === "week" && (key < today || key > addDays(today, 7))) return false;
      if (range === "upcoming" && key < today) return false;
      if (range === "past" && key >= today) return false;
      if (role && r.job_title !== role) return false;
      if (client && r.client !== client) return false;
      if (recruiter && r.recruiter !== recruiter) return false;
      if (type && r.interview_type !== type) return false;
      if (status && r.status !== status) return false;
      if (qn) {
        const hay = `${r.name} ${r.job_title ?? ""} ${r.client ?? ""} ${r.location ?? ""} ${r.interview_notes ?? ""} ${r.rejection_reason ?? ""} ${r.recruiter ?? ""}`.toLowerCase();
        const phoneHit = qDigits.length >= 3 && (r.phone ?? "").replace(/\D/g, "").includes(qDigits);
        if (!hay.includes(qn) && !phoneHit) return false;
      }
      return true;
    });
  }, [rows, range, q, role, client, recruiter, type, status, today]);

  const groups = useMemo(() => {
    const map = new Map<string, InterviewRow[]>();
    for (const r of filtered) {
      const k = ilDateKey(r.interview_date);
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    }
    const keys = Array.from(map.keys()).sort();
    if (range === "past") keys.reverse();
    return keys.map((k) => ({ key: k, rows: map.get(k)!.sort((a, b) => a.interview_date.localeCompare(b.interview_date)) }));
  }, [filtered, range]);

  const todayCount = rows.filter((r) => ilDateKey(r.interview_date) === today).length;
  const upcomingCount = rows.filter((r) => ilDateKey(r.interview_date) >= today).length;

  const exportUrl = (() => {
    const p = new URLSearchParams({ type: "interviews" });
    if (range === "today") { p.set("from", today); p.set("to", today); }
    else if (range === "yesterday") { p.set("from", addDays(today, -1)); p.set("to", addDays(today, -1)); }
    else if (range === "tomorrow") { p.set("from", addDays(today, 1)); p.set("to", addDays(today, 1)); }
    else if (range === "week") { p.set("from", today); p.set("to", addDays(today, 7)); }
    else if (range === "upcoming") p.set("from", today);
    else if (range === "past") p.set("to", addDays(today, -1));
    if (role) p.set("job", role);
    if (client) p.set("client", client);
    return `/api/assistant/export?${p.toString()}`;
  })();

  const clearAll = () => { setQ(""); setRole(""); setClient(""); setRecruiter(""); setType(""); setStatus(""); };
  const hasFilters = q || role || client || recruiter || type || status;

  return (
    <div dir="rtl" className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ראיונות</h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className="font-semibold text-slate-700">{todayCount}</span> היום ·{" "}
            <span className="font-semibold text-slate-700">{upcomingCount}</span> קרובים · לוח משותף לכל המחלקות
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden">
            {([
              ["היום", today],
              ["אתמול", addDays(today, -1)],
            ] as const).map(([label, key]) => (
              <button
                key={label}
                type="button"
                onClick={() => setReportDate(key)}
                className={`text-sm px-3 py-2 border-l border-slate-200 last:border-l-0 transition-colors ${
                  reportDate === key ? "bg-amber-100 text-slate-900 font-semibold" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setReportDate(addDays(reportDate, -1))}
              className="text-sm px-2.5 py-2 text-slate-600 hover:bg-slate-50"
              title="יום אחורה"
              aria-label="יום אחורה"
            >
              ▸
            </button>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => e.target.value && setReportDate(e.target.value)}
              className="text-sm px-2 py-1.5 bg-white text-slate-700 outline-none"
              aria-label="תאריך דוח ראיונות"
            />
            <button
              type="button"
              onClick={() => setReportDate(addDays(reportDate, 1))}
              className="text-sm px-2.5 py-2 text-slate-600 hover:bg-slate-50"
              title="יום קדימה"
              aria-label="יום קדימה"
            >
              ◂
            </button>
          </div>
          <a
            href={`/api/interviews/export?date=${reportDate}${client ? `&client=${encodeURIComponent(client)}` : ""}`}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-900 font-semibold"
            title="דוח ראיונות יומי בפורמט המשרד (XLSX מעוצב)"
          >
            ⬇ דוח ראיונות
          </a>
          <a
            href={exportUrl}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
          >
            ⬇ ייצוא CSV
          </a>
        </div>
      </div>

      {/* Range chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
              range === r ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300 text-slate-600 hover:border-blue-400"
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש: שם, טלפון, תפקיד, מעסיק…"
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[240px] flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">כל התפקידים</option>
          {roleOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={client} onChange={(e) => setClient(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">כל המעסיקים</option>
          {clientOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={recruiter} onChange={(e) => setRecruiter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">כל הרכזות</option>
          {recruiterOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">פרונטלי / וידאו</option>
          <option value="in_person">פרונטלי</option>
          <option value="video">וידאו</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">כל הסטטוסים</option>
          {[LeadStatus.INTERVIEW_BOOKED, LeadStatus.ARRIVED, LeadStatus.NO_SHOW, LeadStatus.HIRED, LeadStatus.STARTED, LeadStatus.REJECTED].map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {hasFilters && (
          <button type="button" onClick={clearAll} className="text-sm text-slate-500 hover:text-slate-800 px-2">
            נקה
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-12 text-center text-slate-500">
          אין ראיונות בטווח הזה.
          <div className="text-xs text-slate-400 mt-2">ראיון נכנס ללוח כשמעבירים ליד לסטטוס &quot;ראיון נקבע&quot; עם תאריך ושעה.</div>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const isToday = g.key === today;
            return (
              <section key={g.key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className={`flex items-center justify-between px-5 py-3 border-b ${isToday ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"}`}>
                  <h2 className={`font-semibold ${isToday ? "text-blue-800" : "text-slate-800"}`}>
                    {ilDayLabel(g.key)}
                    {isToday && <span className="mr-2 text-xs font-bold bg-blue-600 text-white rounded-full px-2 py-0.5">היום</span>}
                    {g.key === addDays(today, 1) && <span className="mr-2 text-xs font-bold bg-slate-700 text-white rounded-full px-2 py-0.5">מחר</span>}
                  </h2>
                  <span className="text-sm font-medium text-slate-500 bg-white rounded-full px-3 py-0.5 border border-slate-200">{g.rows.length}</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {g.rows.map((r) => {
                    return (
                      <li key={r.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                        <span className="text-base font-bold text-slate-900 w-14 shrink-0 tabular-nums pt-0.5">{ilTime(r.interview_date)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link href={`/leads/${r.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline">
                              {r.name}
                            </Link>
                            {r.job_title && <span className="text-sm text-slate-700 bg-slate-100 rounded px-1.5 py-0.5">{r.job_title}</span>}
                            {r.client && <span className="text-sm text-slate-600">@ {r.client}</span>}
                            {r.interview_type && (
                              <span className="text-xs text-slate-500">{r.interview_type === "video" ? "🎥 וידאו" : "🏢 פרונטלי"}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-slate-500">
                            {r.phone ? (
                              <span className="inline-flex items-center gap-2 tabular-nums" dir="ltr">
                                <a href={`tel:${r.phone}`} className="hover:text-blue-700 font-medium text-slate-700">{r.phone}</a>
                                <a
                                  href={`https://wa.me/${normPhone(r.phone)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold"
                                  title="וואטסאפ"
                                >
                                  WA
                                </a>
                              </span>
                            ) : (
                              <span className="text-slate-400">אין טלפון</span>
                            )}
                            {r.location && <span>📍 {r.location}</span>}
                            {r.recruiter && <span>רכזת: {r.recruiter}</span>}
                            {r.source && <span className="text-slate-400">{r.source}</span>}
                          </div>
                          {r.interview_notes && <div className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{r.interview_notes}</div>}
                          {r.status === LeadStatus.REJECTED && (
                            <div className="mt-1.5 text-sm text-gray-700 bg-gray-100 border border-gray-200 rounded-md px-2 py-1 whitespace-pre-wrap">
                              <span className="font-semibold">לא התקבל:</span>{" "}
                              {r.rejection_reason ?? <span className="text-red-600">חסר תיעוד סיבה</span>}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <InterviewMessageDialog
                            name={r.name}
                            phone={r.phone}
                            interviewDate={r.interview_date}
                            jobTitle={r.job_title}
                            interviewType={r.interview_type}
                            recruiter={r.recruiter}
                          />
                          <LeadNotesDialog leadId={r.id} leadName={r.name} size="xs" />
                          <StatusSelect leadId={r.id} leadName={r.name} currentStatus={r.status} allowedStatuses={INTERVIEW_STATUSES} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
