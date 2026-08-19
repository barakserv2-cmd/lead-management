import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LeadStatus } from "@/lib/stateMachine";
import { logAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { findLeadByPhone, duplicatePhonePayload, isPhoneUniqueViolation } from "@/lib/leadPhoneGuard";

export async function GET() {
  return NextResponse.json({ leads: [], total: 0 });
}

// Internal endpoint for the in-dashboard add-lead dialog. Uses the user's
// cookie session — NOT a server action — to bypass Next.js 16's implicit
// route revalidation after server actions, which was rejecting the client
// promise with an opaque "Server Components render" error even when the
// insert itself succeeded.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    phone?: string;
    job_title?: string;
    source?: string;
    status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "שם הוא שדה חובה" }, { status: 400 });
  }

  // One candidate = one phone: refuse a second card for a number we already have.
  const phone = normalizePhone(body.phone);
  if (phone) {
    const existing = await findLeadByPhone(supabase, phone);
    if (existing) return NextResponse.json(duplicatePhonePayload(existing), { status: 409 });
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      name,
      phone,
      job_title: body.job_title?.trim() || null,
      source: body.source || "אחר",
      status: body.status || LeadStatus.NEW_LEAD,
    })
    .select("id")
    .single();

  if (error) {
    if (isPhoneUniqueViolation(error)) {
      const existing = await findLeadByPhone(supabase, phone);
      if (existing) return NextResponse.json(duplicatePhonePayload(existing), { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({ action: "create", leadId: lead.id, actor: user.email, request, meta: { source: body.source || "אחר" } });

  return NextResponse.json({ lead });
}
