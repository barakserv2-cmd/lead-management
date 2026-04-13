import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/types/leads";
import { LeadsContent } from "./leads-content";
import { Pagination } from "./pagination";
import { AddLeadDialog } from "./add-lead-dialog";
import { SearchInput } from "./search-input";
import { FilterBar } from "./filter-bar";
import { Suspense } from "react";

const PAGE_SIZE = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; statuses?: string; tags?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const searchQuery = params.q?.trim() ?? "";
  const statusFilter = params.statuses?.split(",").filter(Boolean) ?? [];
  const tagFilter = params.tags?.split(",").filter(Boolean) ?? [];
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  const searchFilter = searchQuery
    ? `name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,job_title.ilike.%${searchQuery}%`
    : null;

  let dataQuery = supabase.from("leads").select("*").neq("is_candidate", false);
  if (searchFilter) dataQuery = dataQuery.or(searchFilter);
  if (statusFilter.length > 0) dataQuery = dataQuery.in("status", statusFilter);
  if (tagFilter.length > 0) dataQuery = dataQuery.overlaps("tags", tagFilter);
  dataQuery = dataQuery.order("created_at", { ascending: false }).range(from, to);

  let countQuery = supabase.from("leads").select("*", { count: "exact", head: true }).neq("is_candidate", false);
  if (searchFilter) countQuery = countQuery.or(searchFilter);
  if (statusFilter.length > 0) countQuery = countQuery.in("status", statusFilter);
  if (tagFilter.length > 0) countQuery = countQuery.overlaps("tags", tagFilter);

  // Fetch all unique tags across all leads
  const tagsQuery = supabase.from("leads").select("tags").not("tags", "is", null);

  const [{ data: leads }, { count }, { data: tagsData }] = await Promise.all([
    dataQuery,
    countQuery,
    tagsQuery,
  ]);

  const typedLeads = (leads ?? []) as Lead[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Extract unique tags from all leads
  const allTags = Array.from(
    new Set(
      (tagsData ?? []).flatMap((row) => (row.tags as string[]) ?? [])
    )
  ).sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">לידים</h1>
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
