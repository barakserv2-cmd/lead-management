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

// טאבים עליונים: תור עבודה (ברירת מחדל) / תיקיות מדידה / כל הלידים
function LeadsTabs({ active, newCount }: { active: "queue" | "folders" | "all"; newCount: number }) {
  const tabs = [
    { key: "queue" as const, href: "/leads", label: `חדשים לטיפול${newCount > 0 ? ` (${newCount})` : ""}` },
    { key: "folders" as const, href: "/leads?view=folders", label: "תיקיות לפי גורם גיוס" },
    { key: "all" as const, href: "/leads?source=__all__", label: "כל הלידים" },
  ];
  return (
    <div className="flex items-center gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            active === tab.key
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          } ${tab.key === "queue" && newCount > 0 && active !== "queue" ? "text-blue-600" : ""}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; statuses?: string; tags?: string; source?: string; view?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const searchQuery = params.q?.trim() ?? "";
  const statusFilter = params.statuses?.split(",").filter(Boolean) ?? [];
  const tagFilter = params.tags?.split(",").filter(Boolean) ?? [];
  const sourceParam = params.source ?? null;
  const viewParam = params.view ?? null;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  // כל הקריאות הבסיסיות במקביל — כל await טורי הוא סיבוב רשת מלא
  // ל-Supabase, וזה מה שהאט את העמוד.
  const newCountQuery = supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .neq("is_candidate", false)
    .eq("status", LeadStatus.NEW_LEAD);

  // ── תצוגת תיקיות (?view=folders) ────────────────────────────
  // סופרים את כל הלידים לפי מקור וסטטוס — בלי נעילת שיוך, כי זו
  // תצוגת מדידה, לא תור עבודה.
  if (!sourceParam && viewParam === "folders") {
    type Row = { source: string | null; status: string; hired_client: string | null };

    // ספירה + מונה תור במקביל, ואז כל עמודי הסריקה במקביל (לא בטור)
    const [{ count: newLeadsCount }, { count: totalRows }] = await Promise.all([
      newCountQuery,
      supabase.from("leads").select("*", { count: "exact", head: true }).neq("is_candidate", false),
    ]);
    const newCount = newLeadsCount ?? 0;

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
        <LeadsTabs active="folders" newCount={newCount} />
        <FoldersView folders={folders} />
      </div>
    );
  }

  // ── תור עבודה (ברירת מחדל) או תיקייה בודדת (?source=...) ────
  // תור העבודה: כל הלידים בסטטוס "ממתין לנציג", החדש ביותר ראשון.
  // ליד נעלם מהתור רק כשמשנים לו סטטוס, וליד שממתין יותר מדי מסומן
  // בכתום/אדום — אז שום דבר לא מתפספס גם כשיש צבר.
  const isQueue = !sourceParam;
  const effectiveStatusFilter =
    isQueue && statusFilter.length === 0 ? [LeadStatus.NEW_LEAD as string] : statusFilter;

  const sourceFilter =
    !sourceParam || sourceParam === "__all__" ? null : sourceParam === "__none__" ? "__none__" : sourceParam;
  const folderLabel = isQueue
    ? "חדשים לטיפול"
    : sourceParam === "__all__" ? "כל הלידים" : sourceParam === "__none__" ? "ללא מקור" : sourceParam!;

  // ── Assignment lock filter ──────────────────────────────────
  // A lead is visible in the pool if any of:
  //   • assigned_to IS NULL (never claimed)
  //   • assigned_at < now() - 24h (stale claim → auto-released)
  //   • assigned_to = current user (mine)
  // getSession קורא את ה-cookie מקומית בלי סיבוב רשת ל-Supabase —
  // בטוח כאן כי ה-proxy (middleware) כבר אימת את המשתמש מול השרת
  // בכל בקשה. auth.getUser() בעמוד הכפיל את זמן הטעינה לחינם.
  const [{ data: { session } }, { count: newLeadsCount }] = await Promise.all([
    supabase.auth.getSession(),
    newCountQuery,
  ]);
  const newCount = newLeadsCount ?? 0;
  const myId = session?.user?.id ?? "00000000-0000-0000-0000-000000000000";
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const ownershipFilter = `assigned_to.is.null,assigned_at.lt.${cutoff},assigned_to.eq.${myId}`;

  const searchFilter = searchQuery
    ? `name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,job_title.ilike.%${searchQuery}%`
    : null;

  // רק השדות שהטבלה, הקנבן, כרטיס הליד והחלונות הקטנים באמת קוראים
  // (מיפוי מ-13/08/2026 — grep על lead.* בכל רכיבי העמוד). שדות כבדים
  // שאינם בשימוש (גוף מייל, preferences, שדות ניהול) לא נמשכים בכלל.
  const LEAD_LIST_COLUMNS =
    "id, created_at, name, phone, email, age, location, experience, job_title, source, status, sub_status, " +
    "rejection_reason, hired_client, hired_position, start_date, arrival_date, interview_date, " +
    "interview_notes, followup_notes, notes, tags, screening_score, screening_motivation_score, " +
    "screening_fit_score, screening_availability_score, screening_experience_score, extracted_availability, " +
    "extracted_salary_expectation, extracted_location_pref, extracted_interests, needs_attention, " +
    "attention_reason, needs_human_attention, human_attention_reason, human_attention_raised_at";

  // שאילתה אחת מחזירה גם נתונים וגם ספירה כוללת (count: "exact") —
  // במקום שאילתת ספירה נפרדת וכפולה.
  let dataQuery = supabase
    .from("leads")
    .select(LEAD_LIST_COLUMNS, { count: "exact" })
    .neq("is_candidate", false)
    .or(ownershipFilter);
  if (searchFilter) dataQuery = dataQuery.or(searchFilter);
  if (effectiveStatusFilter.length > 0) dataQuery = dataQuery.in("status", effectiveStatusFilter);
  if (tagFilter.length > 0) dataQuery = dataQuery.overlaps("tags", tagFilter);
  if (sourceFilter === "__none__") dataQuery = dataQuery.is("source", null);
  else if (sourceFilter) dataQuery = dataQuery.eq("source", sourceFilter);
  // Sort by true arrival time: email leads use their email send date, others
  // fall back to created_at (both via the generated effective_at column). This
  // keeps a backlog email ingested today from jumping above genuinely newer leads.
  dataQuery = dataQuery.order("effective_at", { ascending: false }).range(from, to);

  // Fetch all unique tags via a Postgres function (single value back, no
  // scanning of every row in JS). Cached via Next.js fetch dedup.
  const tagsRpc = supabase.rpc("get_distinct_lead_tags");

  const [{ data: leads, count }, { data: tagsData }] = await Promise.all([
    dataQuery,
    tagsRpc,
  ]);

  // supabase-js לא מצליח לנתח את מחרוזת העמודות הארוכה — הידוע לנו טוב ממנו
  const typedLeads = (leads ?? []) as unknown as Lead[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const allTags = ((tagsData as string[] | null) ?? []).slice().sort();

  const isNamedFolder = !isQueue && sourceParam !== "__all__";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {isNamedFolder && (
            <Link
              href="/leads?view=folders"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:border-cyan-300 hover:text-cyan-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="m9 18 6-6-6-6" />
              </svg>
              כל התיקיות
            </Link>
          )}
          <h1 className="text-2xl font-bold">{folderLabel}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{totalCount} לידים</span>
          <AddLeadDialog />
        </div>
      </div>
      {!isNamedFolder && <LeadsTabs active={isQueue ? "queue" : "all"} newCount={newCount} />}
      {isQueue && (
        <p className="text-sm text-gray-500 -mt-2 mb-4">
          כל ליד חדש שנכנס מופיע כאן למעלה. טיפלת? שנה סטטוס והוא יורד מהרשימה. כתום/אדום = ממתין יותר מדי.
        </p>
      )}
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
