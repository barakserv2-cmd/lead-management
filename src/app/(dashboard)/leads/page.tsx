import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/types/leads";
import { LeadsContent } from "./leads-content";
import { Pagination } from "./pagination";

const PAGE_SIZE = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  const [{ data: leads }, { count }] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true }),
  ]);

  const typedLeads = (leads ?? []) as Lead[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">לידים</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{totalCount} לידים</span>
          <input
            type="text"
            placeholder="חיפוש..."
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        className="mb-4"
      />
      <LeadsContent leads={typedLeads} />
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        className="mt-4"
      />
    </div>
  );
}
