import type { SupabaseClient } from "@supabase/supabase-js";
import { LeadStatus } from "@/lib/stateMachine";
import type { SourceFolderStats } from "@/app/(dashboard)/leads/folders-view";

const SUCCESS_STATUSES = new Set<string>([LeadStatus.HIRED, LeadStatus.STARTED]);
const NEW_STATUSES = new Set<string>([LeadStatus.NEW_LEAD]);
const CLOSED_STATUSES = new Set<string>([
  LeadStatus.NO_SHOW,
  LeadStatus.CANCELLED_ARRIVAL,
  LeadStatus.NOT_ACCEPTED,
  LeadStatus.REJECTED,
  LeadStatus.LOST_CONTACT,
  LeadStatus.NOT_SUITABLE,
]);

/**
 * Count every candidate lead by recruitment source and outcome bucket. This
 * is a measurement view (no assignment lock), which is why it lives under
 * Reports rather than the leads work queue.
 */
export async function computeSourceFolders(supabase: SupabaseClient): Promise<SourceFolderStats[]> {
  type Row = { source: string | null; status: string; hired_client: string | null };

  const { count: totalRows } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .neq("is_candidate", false);

  const pageCount = Math.max(1, Math.ceil((totalRows ?? 0) / 1000));
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      supabase
        .from("leads")
        .select("source, status, hired_client")
        .neq("is_candidate", false)
        .order("id")
        .range(i * 1000, i * 1000 + 999)
    )
  );
  const rows: Row[] = pages.flatMap((p) => (p.data ?? []) as Row[]);

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
    // הצלחה = סטטוס התקבל/התחיל, או מעסיק רשום (ייבוא מצבת דרך hired_client)
    if (SUCCESS_STATUSES.has(row.status) || row.hired_client) stats.success++;
    else if (NEW_STATUSES.has(row.status)) stats.newCount++;
    else if (CLOSED_STATUSES.has(row.status)) stats.closed++;
    else stats.inProgress++;
  }

  return [...bySource.values()].sort((a, b) => b.total - a.total);
}
