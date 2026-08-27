import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/api-auth";

// תזכורות עצמיות של המגייסת ("להתקשר שוב"). כל מגייסת רואה ומסמנת רק את
// שלה. fetch+API ולא server action — הדפוס הקבוע בפרויקט (Next 16).

async function currentEmail(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email?.toLowerCase() ?? null;
}

export async function POST(request: NextRequest) {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { leadId?: string; title?: string; dueAt?: string; priority?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const leadId = String(body.leadId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const dueAt = String(body.dueAt ?? "").trim();
  if (!leadId || !title) {
    return NextResponse.json({ error: "חסרים נתונים" }, { status: 400 });
  }
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) {
    return NextResponse.json({ error: "מועד תזכורת לא תקין" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("reminders")
    .insert({
      lead_id: leadId,
      recruiter: email,
      title,
      due_date: due.toISOString(),
      priority: body.priority === "high" ? "high" : "normal",
    })
    .select("id, lead_id, title, due_date, priority")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminder: data });
}

export async function GET() {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("reminders")
    .select("id, lead_id, title, due_date, priority, leads(name, phone, status)")
    .eq("recruiter", email)
    .eq("is_completed", false)
    .order("due_date", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminders: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  // eq על recruiter — מגייסת לא יכולה לסמן תזכורת של אחרת
  const { error } = await getSupabaseAdmin()
    .from("reminders")
    .update({ is_completed: true, completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recruiter", email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
