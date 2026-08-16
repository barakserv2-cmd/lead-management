import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// עדכון פרטי מועמד מחלון העריכה הצף. fetch+API ולא server action —
// הדפוס הקבוע בפרויקט (Next 16 מפיל טפסים דרך server actions).

// שדות שמותר לערוך מהחלון — כל השאר נדחה
const EDITABLE_FIELDS = new Set([
  "name",
  "phone",
  "email",
  "job_title",
  "location",
  "experience",
  "age",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE_FIELDS.has(key)) continue;
    if (key === "age") {
      const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
      updateData.age = Number.isFinite(n) && n > 0 && n < 120 ? n : null;
    } else if (key === "name") {
      const name = String(value ?? "").trim();
      if (!name) return NextResponse.json({ error: "שם הוא שדה חובה" }, { status: 400 });
      updateData.name = name;
    } else {
      const s = String(value ?? "").trim();
      updateData[key] = s || null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "אין שדות לעדכון" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", leadId)
    .select("id, name, phone, email, job_title, location, experience, age")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lead: data });
}
