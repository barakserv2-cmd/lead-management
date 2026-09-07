import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/phone";

/**
 * GET /api/bridge/lead-summary?phone=... — a NEUTRAL, structured summary of a
 * candidate's prior contact, for גובגט's INTERNAL use only (so it doesn't
 * re-ask what's known). Deliberately excludes free-text recruiter notes and
 * subjective/rejection reasons — only neutral extracted fields. Auth:
 * x-machine-key. (Privacy: תיקון 13 — minimal, purpose-limited.)
 */
export async function GET(req: NextRequest) {
  const key = req.headers.get("x-machine-key");
  if (!key || key !== process.env.MACHINE_BRIDGE_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const phone = normalizePhone(req.nextUrl.searchParams.get("phone") ?? "");
  if (!phone) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: lead } = await db
    .from("leads")
    .select("job_title, source, updated_at, extracted_availability, extracted_salary_expectation, extracted_location_pref, extracted_interests")
    .eq("phone", phone)
    .maybeSingle();

  if (!lead) return NextResponse.json({ exists: false, summary: null });

  const days = lead.updated_at
    ? Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86400_000)
    : null;

  // Build a neutral Hebrew summary from structured fields only.
  const parts: string[] = ["פנה/תה אלינו בעבר"];
  if (days !== null) parts.push(`פעילות אחרונה לפני ~${days} ימים`);
  if (lead.job_title) parts.push(`התעניין/ה בתפקיד: ${lead.job_title}`);
  if (lead.extracted_location_pref) parts.push(`העדפת מיקום: ${lead.extracted_location_pref}`);
  if (lead.extracted_availability) parts.push(`זמינות: ${lead.extracted_availability}`);
  if (lead.extracted_salary_expectation) parts.push(`ציפיית שכר: ${lead.extracted_salary_expectation}`);
  if (lead.extracted_interests) parts.push(`תחומי עניין: ${lead.extracted_interests}`);

  return NextResponse.json({ exists: true, summary: parts.join(" · ") });
}
