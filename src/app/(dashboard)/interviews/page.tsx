import { getSupabaseAdmin } from "@/lib/api-auth";
import { fetchInterviewRows, interviewWindow } from "@/lib/interviewsBoard";
import { InterviewsContent } from "./interviews-content";

export const dynamic = "force-dynamic";

// Interviews board: FRONTAL (in-person / video) interviews only. Phone screens
// that Gubget coordinates live in their own tab under leads ("ראיון טלפון").
// By default a window from 90 days back to two months ahead; ?from/?to override
// it. Filtering, grouping by day and search are client-side (small volume).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from: fromParam, to: toParam } = await searchParams;
  const customFrom = DATE_RE.test(fromParam ?? "") ? fromParam! : null;
  const customTo = DATE_RE.test(toParam ?? "") ? toParam! : null;

  const supabase = getSupabaseAdmin();
  const { rangeStart, rangeEnd, isCustom } = interviewWindow(customFrom, customTo);
  const rows = await fetchInterviewRows(supabase, { rangeStart, rangeEnd, isCustom, typeMode: "frontal" });

  return (
    <InterviewsContent
      rows={rows}
      customRange={isCustom ? { from: customFrom, to: customTo } : null}
    />
  );
}
