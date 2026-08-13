import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/types/leads";
import Link from "next/link";
import { LeadsContent } from "./leads-content";
import { Pagination } from "./pagination";
import { AddLeadDialog } from "./add-lead-dialog";
import { SearchInput } from "./search-input";
import { FilterBar } from "./filter-bar";
import { FoldersView, type SourceFolderStats } from "./folders-view";
import { LeadStatus } from "@/lib/stateMachine";
import { Suspense } from "react";

const PAGE_SIZE = 50;

// קיבוץ סטטוסים למדדי תיקייה: הצלחה = התקבל / התחיל לעבוד
const SUCCESS_STATUSES = new Set<string>([LeadStatus.HIRED, LeadStatus.STARTED]);
const NEW_STATUSES = new Set<string>([LeadStatus.NEW_LEAD]);
const CLOSED_STATUSES = new Set<string>([
  LeadStatus.NO_SHOW,
  LeadStatus.REJECTED,
  LeadStatus.LOST_CONTACT,
  LeadStatus.NOT_SUITABLE,
]);

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; statuses?: string; tags?: string; source?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const searchQuery = params.q?.trim() ?? "";
  const statusFilter = params.statuses?.split(",").filter(Boolean) ?? [];
  const tagFilter = params.tags?.split(",").filter(Boolean) ?? [];
  const sourceParam = params.source ?? null;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  // ── תצוגת תיקיות (ברירת מחדל, בלי ?source) ──────────────────
  // סופרים את כל הלידים לפי מקור וסטטוס — בלי נעילת שיוך, כי זו
  // תצוגת מדידה, לא תור עבודה.
  if (!sourceParam) {
    type Row = { source: string | null; status: string; hired_client: string | null };
    const rows: Row[] = [];
    for (let fromIdx = 0; ; fromIdx += 1000) {
      const { data } = await supabase
        .from("leads")
        .select("source, status, hired_client")
        .neq("is_candidate", false)
        .order("id")
        .range(fromIdx, fromIdx + 999);
      rows.push(...((data ?? []) as Row[]));
      if (!data || data.length < 1000) break;
    }

    const bySource = new Map<string, SourceFolderStats>();
    for (const row of rows) {
      const key = row.source?.trim() || "__none__";
      const label = row.source?.trim() || "ללא מקור";
      let stats = bySource.get(key);
      if (!stats) {
        stats = { key, label, total: 0, newCount: 0, inProgress: 0, success: 0, closed: 0 };
        bySource.set(key, stats);
      }
      stats.total++;
      // הצלחה = סטטוס התקבל/התחיל, או מעסיק רשום — השמות ההיסטוריות
      // (ייבוא מצבת) רשומות דרך hired_client בלי מעבר סטטוס.
      if (SUCCESS_STATUSES.has(row.status) || row.hired_client) stats.success++;
      else if (NEW_STATUSES.has(row.status)) stats.newCount++;
      else if (CLOSED_STATUSES.has(row.status)) stats.closed++;
      else stats.inProgress++;
    }

    const folders = [...bySource.values()].sort((a, b) => b.total - a.total);

    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">לידים לפי גורם גיוס</h1>
            <p className="text-sm text-gray-500 mt-0.5">בחר תיקייה כדי לעבוד על הלידים שבה</p>
          </div>
          <AddLeadDialog />
        </div>
        <FoldersView folders={folders} />
      </div>
    );
  }

  // ── תצוגת תיקייה בודדת (?source=...) ────────────────────────
  const sourceFilter =
    sourceParam === "__all__" ? null : sourceParam === "__none__" ? "__none__" : sourceParam;
  const folderLabel =
    sourceParam === "__all__" ? "כל הלידים" : sourceParam === "__none__" ? "ללא מקור" : sourceParam;

  // ── Assignment lock filter ──────────────────────────────────
  // A lead is visible in the pool if any of:
  //   • assigned_to IS NULL (never claimed)
  //   • assigned_at < now() - 24h (stale claim → auto-released)
  //   • assigned_to = current user (mine)
  const { data: { user } } = await supabase.auth.getUser();
  const myId = user?.id ?? "00000000-0000-0000-0000-000000000000";
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const ownershipFilter = `assigned_to.is.null,assigned_at.lt.${cutoff},assigned_to.eq.${myId}`;

  const searchFilter = searchQuery
    ? `name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,job_title.ilike.%${searchQuery}%`
    : null;

  let dataQuery = supabase.from("leads").select("*").neq("is_candidate", false).or(ownershipFilter);
  if (searchFilter) dataQuery = dataQuery.or(searchFilter);
  if (statusFilter.length > 0) dataQuery = dataQuery.in("status", statusFilter);
  if (tagFilter.length > 0) dataQuery = dataQuery.overlaps("tags", tagFilter);
  if (sourceFilter === "__none__") dataQuery = dataQuery.is("source", null);
  else if (sourceFilter) dataQuery = dataQuery.eq("source", sourceFilter);
  dataQuery = dataQuery.order("created_at", { ascending: false }).range(from, to);

  let countQuery = supabase.from("leads").select("*", { count: "exact", head: true }).neq("is_candidate", false).or(ownershipFilter);
  if (searchFilter) countQuery = countQuery.or(searchFilter);
  if (statusFilter.length > 0) countQuery = countQuery.in("status", statusFilter);
  if (tagFilter.length > 0) countQuery = countQuery.overlaps("tags", tagFilter);
  if (sourceFilter === "__none__") countQuery = countQuery.is("source", null);
  else if (sourceFilter) countQuery = countQuery.eq("source", sourceFilter);

  // Fetch all unique tags via a Postgres function (single value back, no
  // scanning of every row in JS). Cached via Next.js fetch dedup.
  const tagsRpc = supabase.rpc("get_distinct_lead_tags");

  const [{ data: leads }, { count }, { data: tagsData }] = await Promise.all([
    dataQuery,
    countQuery,
    tagsRpc,
  ]);

  const typedLeads = (leads ?? []) as Lead[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const allTags = ((tagsData as string[] | null) ?? []).slice().sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/leads"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:border-cyan-300 hover:text-cyan-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="m9 18 6-6-6-6" />
            </svg>
            כל התיקיות
          </Link>
          <h1 className="text-2xl font-bold">{folderLabel}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{totalCount} לידים</span>
          <AddLeadDialog />
        </div>
      </div>
      <Suspense fallback={null}>
        <SearchInput />
      </Suspense>
      <Suspense fallback={null}>
        <FilterBar allTags={allTags} />
      </Suspense>
      <Suspense fallback={null}>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          className="mb-4"
        />
      </Suspense>
      <LeadsContent leads={typedLeads} />
      <Suspense fallback={null}>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          className="mt-4"
        />
      </Suspense>
    </div>
  );
}
