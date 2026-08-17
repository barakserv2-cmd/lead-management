import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { LEAD_STATUSES } from "@/lib/constants";
import type { Lead } from "@/types/leads";
import { HiredContent } from "./hired/hired-content";
import { AdvancesContent, type AdvanceRow, type WorkerOption } from "./advances-content";
import { TransfersContent, type TransferRow } from "./transfers-content";

export const dynamic = "force-dynamic";

type Tab = "hired" | "advances" | "transfers";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "hired", label: "דוח מועסקים", icon: "👷" },
  { key: "advances", label: "דוח מקדמות", icon: "💸" },
  { key: "transfers", label: "דוח העברות בין עבודות", icon: "🔁" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "advances" || rawTab === "transfers" ? rawTab : "hired";
  const supabase = getSupabaseAdmin();

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

  if (tab === "hired") {
    const { data: leads } = await supabase
      .from("leads")
      .select("*")
      .in("status", [LEAD_STATUSES.HIRED, LEAD_STATUSES.STARTED])
      .order("created_at", { ascending: false });
    content = <HiredContent leads={(leads ?? []) as Lead[]} />;
  } else if (tab === "advances") {
    const [{ data: rows, error }, { data: workers }] = await Promise.all([
      supabase
        .from("advances")
        .select("id, lead_id, amount, paid_at, employer, notes, created_by, created_at, leads(name, phone, hired_client, hired_position, job_title, start_date)")
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
        .select("id, lead_id, from_client, from_position, to_client, to_position, transferred_at, reason, source, created_by, leads(name, phone)")
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
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/reports?tab=${t.key}`}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <span className="ml-1.5">{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </div>
      {content}
    </div>
  );
}
