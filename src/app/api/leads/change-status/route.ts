import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { changeLeadStatus, type ChangeStatusInput } from "@/lib/actions/changeLeadStatus";

// Internal endpoint for in-dashboard status changes (kanban drag, status
// dropdown, interview/hired/sub-status dialogs). Uses the user's cookie
// session — NOT a server action — to bypass Next.js 16's implicit route
// revalidation after server actions, which both slowed every save (full
// RSC render of /leads inside the action response) and rejected the client
// promise with an opaque "Server Components render" error on render failure.
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ChangeStatusInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.leadId || !body.newStatus) {
    return NextResponse.json(
      { error: "Missing required fields: leadId, newStatus" },
      { status: 400 }
    );
  }

  const result = await changeLeadStatus({
    leadId: body.leadId,
    newStatus: body.newStatus,
    userId: body.userId ?? user.email ?? "user",
    notes: body.notes,
    extra: body.extra,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({ success: true });
}
