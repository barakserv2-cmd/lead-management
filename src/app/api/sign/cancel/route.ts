import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST — ביטול בקשת חתימה pending (הקישור מפסיק לעבוד)
export async function POST(req: NextRequest) {
  const cookieClient = await createCookieClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { requestId } = await req.json();
  if (!requestId) {
    return NextResponse.json({ success: false, error: "חסר requestId" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: updated, error } = await admin
    .from("signature_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id, lead_id, file_name")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ success: false, error: "הבקשה כבר לא ממתינה" }, { status: 409 });
  }

  await admin.from("lead_events").insert({
    lead_id: updated.lead_id,
    event_type: "מסמכים",
    event_text: `בוטלה בקשת חתימה דיגיטלית: ${updated.file_name}`,
    created_by: user.email ?? "מערכת",
  });

  return NextResponse.json({ success: true });
}
