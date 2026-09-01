"use client";

import { useMemo, useState } from "react";
import { LeadNotesDialog } from "../leads/lead-notes-dialog";
import { InterviewMessageDialog } from "./interview-message-dialog";
import { RescheduleDialog } from "./reschedule-dialog";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  interview_type: "phone" | "in_person" | "video" | null;
  interview_notes: string | null;
  rejection_reason: string | null;
  last_note: { text: string; type: string; at: string; by: string | null } | null;
  client: string | null;
  recruiter: string | null;
  source: string | null;
}

const TZ = "Asia/Jerusalem";

// interview_date נשמר כשעון קיר ישראלי עם תווית UTC (ראו cron/daily) —
// קוראים את שדות ה-UTC כמו שהם. המרה ל-Asia/Jerusalem מוסיפה את ההיסט פעמיים.
const pad2 = (n: number) => String(n).padStart(2, "0");
function wallDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function wallTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

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
// "היום" / "אתמול" / "12 באוג" — מספיק כדי לדעת אם ההערה טרייה.
function shortWhen(iso: string): string {
  const key = ilDateKey(iso);
  const t = todayKey();
  if (key === t) return `היום ${ilTime(iso)}`;
  if (key === addDays(t, -1)) return "אתמול";
  return new Date(`${key}T12:00:00`).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
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
  LeadStatus.NOT_ACCEPTED,
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

export function InterviewsContent({
  rows,
  customRange = null,
}: {
  rows: InterviewRow[];
  /** טווח תאריכים מפורש מה-URL — מחליף את צ'יפי הטווח ואת חלון ברירת המחדל */
  customRange?: { from: string | null; to: string | null } | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [range, setRange] = useState<Range>("upcoming");
  const [rescheduling, setRescheduling] = useState<InterviewRow | null>(null);
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
      const key = wallDateKey(r.interview_date);
      // טווח מפורש כבר סונן בשרת — הצ'יפים לא מצמצמים אותו שוב
      if (customRange) {
        // נופל דרך לשאר הפילטרים
      } else {
      if (range === "today" && key !== today) return false;
      if (range === "yesterday" && key !== addDays(today, -1)) return false;
      if (range === "tomorrow" && key !== addDays(today, 1)) return false;
      if (range === "week" && (key < today || key > addDays(today, 7))) return false;
      if (range === "upcoming" && key < today) return false;
      if (range === "past" && key >= today) return false;
      }
      if (role && r.job_title !== role) return false;
      if (client && r.client !== client) return false;
      if (recruiter && r.recruiter !== recruiter) return false;
      if (type && r.interview_type !== type) return false;
      if (status && r.status !== status) return false;
      if (qn) {
        const hay = `${r.name} ${r.job_title ?? ""} ${r.client ?? ""} ${r.location ?? ""} ${r.interview_notes ?? ""} ${r.rejection_reason ?? ""} ${r.last_note?.text ?? ""} ${r.recruiter ?? ""}`.toLowerCase();
        const phoneHit = qDigits.length >= 3 && (r.phone ?? "").replace(/\D/g, "").includes(qDigits);
        if (!hay.includes(qn) && !phoneHit) return false;
      }
      return true;
    });
  }, [rows, range, q, role, client, recruiter, type, status, today, customRange]);

  const groups = useMemo(() => {
    const map = new Map<string, InterviewRow[]>();
    for (const r of filtered) {
      const k = wallDateKey(r.interview_date);
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    }
    const keys = Array.from(map.keys()).sort();
    if (range === "past") keys.reverse();
    return keys.map((k) => ({ key: k, rows: map.get(k)!.sort((a, b) => a.interview_date.localeCompare(b.interview_date)) }));
  }, [filtered, range]);

  const todayCount = rows.filter((r) => wallDateKey(r.interview_date) === today).length;
  const upcomingCount = rows.filter((r) => wallDateKey(r.interview_date) >= today).length;

  const exportUrl = (() => {
    const p = new URLSearchParams({ type: "interviews" });
    if (range === "today") { p.set("from", today); p.set("to", today); }
    else if (range === "yesterday") { p.set("from", addDays(today, -1)); p.set("to", addDays(today, -1)); }
    else if (range === "tomorrow") { p.set("from", addDays(today, 1)); p.set("to", addDays(today, 1)); }
    else if (range === "week") { p.set("from", today); p.set("to", addDays(today, 7)); }
    else if (range === "upcoming") p.set("from", today);
    else if (range === "past") p.set("to", addDays(today, -1));
    if (customRange?.from) p.set("from", customRange.from);
    if (customRange?.to) p.set("to", customRange.to);
    if (role) p.set("job", role);
    if (client) p.set("client", client);
    return `/api/assistant/export?${p.toString()}`;
  })();

  // חיפוש התאריכים חי ב-URL כי הוא נפתר בשרת — כך אפשר להגיע גם לראיונות
  // שמחוץ לחלון ברירת המחדל, והקישור ניתן לשיתוף.
  function applyDates(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextFrom) params.set("from", nextFrom); else params.delete("from");
    if (nextTo) params.set("to", nextTo); else params.delete("to");
    const qs = params.toString();
    router.push(qs ? `/interviews?${qs}` : "/interviews");
  }

  function clearDates() {
    applyDates("", "");
  }

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

      {/* Date range search — server-side, so it reaches outside the default window */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm ${
          customRange ? "border-blue-400 bg-blue-50 text-blue-800" : "border-slate-300 bg-white text-slate-600"
        }`}>
          <span className="text-xs font-medium">חיפוש תאריכים:</span>
          <input
            type="date"
            value={customRange?.from ?? ""}
            max={customRange?.to || undefined}
            onChange={(e) => applyDates(e.target.value, customRange?.to ?? "")}
            className="bg-transparent text-sm outline-none w-[8rem] cursor-pointer"
            aria-label="מתאריך"
          />
          <span className="text-slate-400">–</span>
          <input
            type="date"
            value={customRange?.to ?? ""}
            min={customRange?.from || undefined}
            onChange={(e) => applyDates(customRange?.from ?? "", e.target.value)}
            className="bg-transparent text-sm outline-none w-[8rem] cursor-pointer"
            aria-label="עד תאריך"
          />
          {customRange && (
            <button
              type="button"
              onClick={clearDates}
              className="text-xs text-blue-700 hover:text-blue-900 font-semibold px-1"
              title="נקה טווח תאריכים"
            >
              ✕
            </button>
          )}
        </div>
        {customRange && (
          <span className="text-xs text-slate-500">
            מציג {filtered.length} ראיונות בטווח שנבחר · צ&apos;יפי הטווח מושבתים
          </span>
        )}
      </div>

      {/* Range chips */}
      <div className={`flex flex-wrap gap-1.5 mb-3 ${customRange ? "opacity-40 pointer-events-none" : ""}`}>
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
          <option value="">כל סוגי הראיון</option>
          <option value="phone">טלפוני</option>
          <option value="in_person">פרונטלי</option>
          <option value="video">וידאו</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">כל הסטטוסים</option>
          {[LeadStatus.INTERVIEW_BOOKED, LeadStatus.ARRIVED, LeadStatus.NO_SHOW, LeadStatus.HIRED, LeadStatus.STARTED, LeadStatus.NOT_ACCEPTED, LeadStatus.REJECTED].map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {hasFilters && (
          <button type="button" onClick={clearAll} className="text-sm text-slate-500 hover:text-slate-800 px-2">
            נקה
          </button>
        )}
      </div>

      {rescheduling && (
        <RescheduleDialog
          leadId={rescheduling.id}
          leadName={rescheduling.name}
          currentDate={rescheduling.interview_date}
          currentType={rescheduling.interview_type}
          onClose={() => setRescheduling(null)}
        />
      )}

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
                        <span className="text-base font-bold text-slate-900 w-14 shrink-0 tabular-nums pt-0.5">{wallTime(r.interview_date)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link href={`/leads/${r.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline">
                              {r.name}
                            </Link>
                            {r.job_title && <span className="text-sm text-slate-700 bg-slate-100 rounded px-1.5 py-0.5">{r.job_title}</span>}
                            {r.client && <span className="text-sm text-slate-600">@ {r.client}</span>}
                            {r.interview_type && (
                              <span className="text-xs text-slate-500">{r.interview_type === "video" ? "🎥 וידאו" : r.interview_type === "phone" ? "📞 טלפוני" : "🏢 פרונטלי"}</span>
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
                          {r.status === LeadStatus.NOT_ACCEPTED && (
                            <div className="mt-1.5 text-sm text-pink-900 bg-pink-50 border border-pink-200 rounded-md px-2 py-1 whitespace-pre-wrap">
                              <span className="font-semibold">לא התקבל:</span>{" "}
                              {r.rejection_reason ?? <span className="text-red-600">חסר תיעוד סיבה</span>}
                            </div>
                          )}
                          {r.last_note && (
                            <div className="mt-1.5 flex items-start gap-1.5 text-sm text-slate-600">
                              <span className="shrink-0 text-[11px] font-semibold text-violet-700 bg-violet-100 rounded px-1.5 py-0.5">
                                {r.last_note.type}
                              </span>
                              <span className="min-w-0 line-clamp-2 whitespace-pre-wrap">{r.last_note.text}</span>
                              <span className="shrink-0 text-xs text-slate-400">
                                {shortWhen(r.last_note.at)}
                                {r.last_note.by ? ` · ${r.last_note.by}` : ""}
                              </span>
                            </div>
                          )}
                          {r.status === LeadStatus.REJECTED && r.rejection_reason && (
                            <div className="mt-1.5 text-sm text-gray-700 bg-gray-100 border border-gray-200 rounded-md px-2 py-1 whitespace-pre-wrap">
                              <span className="font-semibold">נדחה:</span> {r.rejection_reason}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setRescheduling(r)}
                            title="שנה מועד ראיון"
                            className="h-7 px-2 text-xs rounded-md border border-purple-300 text-purple-700 hover:bg-purple-50 transition-colors"
                          >
                            🗓 שנה מועד
                          </button>
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
