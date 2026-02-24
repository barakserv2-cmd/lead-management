import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/types/leads";
import { LeadsContent } from "./leads-content";
import { Pagination } from "./pagination";
import { AddLeadDialog } from "./add-lead-dialog";
import { SearchInput } from "./search-input";
import { Suspense } from "react";

const PAGE_SIZE = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const searchQuery = params.q?.trim() ?? "";
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  const searchFilter = searchQuery
    ? `name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,job_title.ilike.%${searchQuery}%`
    : null;

  let dataQuery = supabase.from("leads").select("*");
  if (searchFilter) dataQuery = dataQuery.or(searchFilter);
  dataQuery = dataQuery.order("created_at", { ascending: false }).range(from, to);

  let countQuery = supabase.from("leads").select("*", { count: "exact", head: true });
  if (searchFilter) countQuery = countQuery.or(searchFilter);

  const [{ data: leads }, { count }] = await Promise.all([dataQuery, countQuery]);

  const typedLeads = (leads ?? []) as Lead[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        searchQuery={searchQuery}
        className="mb-4 mt-3"
      />
      <LeadsContent leads={typedLeads} />
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        searchQuery={searchQuery}
        className="mt-4"
      />
    </div>
  );
}
