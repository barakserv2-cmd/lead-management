import Link from "next/link";
import { HardHat, Home, Repeat, Filter, ShieldCheck, Folder, Wallet, Anchor, type LucideIcon } from "lucide-react";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";
import { LEAD_STATUSES } from "@/lib/constants";
import type { Lead } from "@/types/leads";
import { HiredContent } from "./hired/hired-content";
import { AdvancesContent, type AdvanceRow, type WorkerOption } from "./advances-content";
import { TransfersContent, type TransferRow } from "./transfers-content";
import { FunnelContent } from "./funnel-content";
import { FinanceContent } from "./finance-content";
import { GuaranteeContent } from "./guarantee-content";
import { RetentionContent } from "./retention-content";
import { computeAnalytics, computeFinance } from "@/lib/analytics";
import { computeGuaranteeReport } from "@/lib/postPlacement";
import { computeRetention } from "@/lib/retention";
import { isFinanceUser } from "@/lib/finance";
import { computeSourceFolders } from "@/lib/sourceFolders";
import { FoldersView } from "../leads/folders-view";

export const dynamic = "force-dynamic";

type Tab = "hired" | "advances" | "transfers" | "funnel" | "finance" | "guarantee" | "retention" | "sources";

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: "hired", label: "דוח מועסקים", icon: HardHat },
  { key: "advances", label: "דוח מקדמות לדיור", icon: Home },
  { key: "transfers", label: "דוח העברות בין עבודות", icon: Repeat },
  { key: "funnel", label: "משפך", icon: Filter },
  { key: "guarantee", label: "אחריות", icon: ShieldCheck },
  { key: "retention", label: "שימור", icon: Anchor },
  { key: "sources", label: "תיקיות לפי גורם גיוס", icon: Folder },
];

/** ברירת מחדל: 30 הימים האחרונים, לפי לוח ישראל. */
function defaultRange(): { from: string; to: string } {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 30);
  return { from: d.toISOString().slice(0, 10), to: today };
}

// חצות לפי שעון ישראל כרגע UTC — נכון גם בשעון חורף (+02:00) וגם בקיץ
// (+03:00). היסט קבוע של +03:00 הזיז בחורף כל טווח בשעה.
function ilDayStartUTC(dateStr: string): Date {
  const noon = new Date(`${dateStr}T12:00:00Z`);
  const offsetMs =
    new Date(noon.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })).getTime() -
    new Date(noon.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - offsetMs);
}

function shiftDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
  const { tab: rawTab, from: rawFrom, to: rawTo } = await searchParams;
  // הלשונית הכספית קיימת רק למשתמש המורשה — האכיפה כאן, בצד השרת
  const authed = await getAuthedUser();
  const financeAllowed = isFinanceUser(authed?.email);
  const tab: Tab =
    rawTab === "advances" || rawTab === "transfers" || rawTab === "funnel" || rawTab === "guarantee" || rawTab === "retention" || rawTab === "sources"
      ? rawTab
      : rawTab === "finance" && financeAllowed
        ? "finance"
        : "hired";
  const supabase = getSupabaseAdmin();

  const dr = defaultRange();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom ?? "") ? rawFrom! : dr.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(rawTo ?? "") ? rawTo! : dr.to;
  // גבולות יום לפי שעון ישראל — created_at הוא זמן אמת
  const fromIso = ilDayStartUTC(from).toISOString();
  const toIso = new Date(ilDayStartUTC(shiftDays(to, 1)).getTime() - 1).toISOString();

  // Placed workers — the pick-list for both entry forms.
  const workersPromise =
    tab === "hired"
      ? Promise.resolve({ data: null })
      : supabase
          .from("leads")
          .select("id, name, phone, hired_client, hired_position, job_title, start_date")
          .in("status", [LEAD_STATUSES.HIRED, LEAD_STATUSES.STARTED])
          .order("name", { ascending: true })
          .limit(2000);

  let content: React.ReactNode;

  if (tab === "sources") {
    const folders = await computeSourceFolders(supabase);
    content = <FoldersView folders={folders} />;
  } else if (tab === "funnel") {
    // תקופת השוואה: אותו מספר ימים, מיד לפני התקופה הנבחרת
    const days = Math.round((ilDayStartUTC(to).getTime() - ilDayStartUTC(from).getTime()) / 86_400_000) + 1;
    const prevTo = shiftDays(from, -1);
    const prevFrom = shiftDays(prevTo, -(days - 1));
    const [analytics, prev, { data: profiles }] = await Promise.all([
      computeAnalytics(supabase, fromIso, toIso),
      computeAnalytics(
        supabase,
        ilDayStartUTC(prevFrom).toISOString(),
        new Date(ilDayStartUTC(from).getTime() - 1).toISOString()
      ),
      supabase.from("user_profiles").select("name, email"),
    ]);
    // שם תצוגה לרכזת במקום האימייל
    const recruiterNames: Record<string, string> = {};
    for (const p of (profiles ?? []) as { name: string | null; email: string | null }[]) {
      if (p.email && p.name && !p.name.includes("@")) recruiterNames[p.email.toLowerCase()] = p.name;
    }
    content = (
      <FunnelContent
        data={analytics}
        prev={prev}
        from={from}
        to={to}
        prevFrom={prevFrom}
        prevTo={prevTo}
        recruiterNames={recruiterNames}
      />
    );
  } else if (tab === "guarantee") {
    const rows = await computeGuaranteeReport(supabase);
    content = <GuaranteeContent rows={rows} />;
  } else if (tab === "retention") {
    const report = await computeRetention(supabase);
    content = <RetentionContent data={report} />;
  } else if (tab === "finance") {
    const analytics = await computeAnalytics(supabase, fromIso, toIso);
    const finance = await computeFinance(supabase, fromIso, toIso, analytics.sources);
    content = <FinanceContent data={finance} from={from} to={to} />;
  } else if (tab === "hired") {
    // תאריך הקבלה = המעבר האחרון ל-HIRED בהיסטוריית הסטטוסים (אין עמודה
    // ייעודית על הליד). start_date נשאר "תאריך תחילת עבודה".
    const [{ data: leads }, { data: hiredHistory }] = await Promise.all([
      supabase
        .from("leads")
        .select("*")
        .in("status", [LEAD_STATUSES.HIRED, LEAD_STATUSES.STARTED, LEAD_STATUSES.EMPLOYMENT_ENDED])
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_status_history")
        .select("lead_id, changed_at")
        .eq("to_status", LEAD_STATUSES.HIRED)
        .order("changed_at", { ascending: false })
        .limit(5000),
    ]);
    const hiredAt: Record<string, string> = {};
    for (const h of (hiredHistory ?? []) as { lead_id: string; changed_at: string }[]) {
      if (!hiredAt[h.lead_id]) hiredAt[h.lead_id] = h.changed_at; // ממוין יורד — הראשון הוא האחרון
    }
    content = <HiredContent leads={(leads ?? []) as Lead[]} hiredAt={hiredAt} />;
  } else if (tab === "advances") {
    const [{ data: rows, error }, { data: workers }] = await Promise.all([
      supabase
        .from("advances")
        .select("id, lead_id, amount, paid_at, employer, notes, reason, created_by, created_at, leads(name, phone, hired_client, hired_position, job_title, start_date)")
        .order("paid_at", { ascending: false })
        .limit(2000),
      workersPromise,
    ]);
    const typed: AdvanceRow[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => {
      const l = (r.leads as Record<string, unknown> | null) ?? {};
      return {
        id: r.id as string,
        lead_id: r.lead_id as string,
        amount: Number(r.amount),
        paid_at: r.paid_at as string,
        employer: (r.employer as string | null) ?? (l.hired_client as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
        reason: ((r.reason as string | null) ?? "requested") as AdvanceRow["reason"],
        created_by: (r.created_by as string | null) ?? null,
        name: (l.name as string) ?? "—",
        phone: (l.phone as string | null) ?? null,
        position: (l.hired_position as string | null) ?? (l.job_title as string | null) ?? null,
        start_date: (l.start_date as string | null) ?? null,
      };
    });
    content = (
      <AdvancesContent
        rows={typed}
        workers={(workers ?? []) as WorkerOption[]}
        loadError={error?.message ?? null}
      />
    );
  } else {
    const [{ data: rows, error }, { data: workers }, { data: clients }] = await Promise.all([
      supabase
        .from("job_transfers")
        .select("id, lead_id, from_client, from_position, to_client, to_position, transferred_at, from_start_date, to_start_date, reason, source, created_by, leads(name, phone)")
        .order("transferred_at", { ascending: false })
        .limit(2000),
      workersPromise,
      supabase.from("clients").select("name").order("name"),
    ]);
    const typed: TransferRow[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => {
      const l = (r.leads as Record<string, unknown> | null) ?? {};
      return {
        id: r.id as string,
        lead_id: r.lead_id as string,
        from_client: (r.from_client as string | null) ?? null,
        from_position: (r.from_position as string | null) ?? null,
        to_client: (r.to_client as string | null) ?? null,
        to_position: (r.to_position as string | null) ?? null,
        transferred_at: r.transferred_at as string,
        from_start_date: (r.from_start_date as string | null) ?? null,
        to_start_date: (r.to_start_date as string | null) ?? null,
        reason: (r.reason as string | null) ?? null,
        source: (r.source as string) ?? "manual",
        created_by: (r.created_by as string | null) ?? null,
        name: (l.name as string) ?? "—",
        phone: (l.phone as string | null) ?? null,
      };
    });
    content = (
      <TransfersContent
        rows={typed}
        workers={(workers ?? []) as WorkerOption[]}
        clientNames={((clients ?? []) as { name: string }[]).map((c) => c.name)}
        loadError={error?.message ?? null}
      />
    );
  }

  return (
    <div dir="rtl">
      <h1 className="text-xl font-semibold text-gray-900 tracking-tight mb-4">דוחות</h1>
      <nav className="flex items-center gap-6 mb-6 border-b border-gray-200 overflow-x-auto" aria-label="סוגי דוחות">
        {[...TABS, ...(financeAllowed ? [{ key: "finance" as Tab, label: "כספים", icon: Wallet }] : [])].map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/reports?tab=${t.key}`}
              aria-current={isActive ? "page" : undefined}
              className={`-mb-px flex items-center gap-1.5 whitespace-nowrap pb-2.5 pt-1 text-[13px] font-medium border-b-2 transition-colors ${
                isActive ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-cyan-600" : "text-gray-400"}`} strokeWidth={1.75} />
              {t.label}
            </Link>
          );
        })}
      </nav>
      {content}
    </div>
  );
}
