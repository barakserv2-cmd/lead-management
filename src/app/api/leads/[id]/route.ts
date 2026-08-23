import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { diffFields, logAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { findLeadByPhone, duplicatePhonePayload, isPhoneUniqueViolation } from "@/lib/leadPhoneGuard";
import { normalizeEmployerName } from "@/lib/employerNormalization";

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
  // מידע גיוס — נערך מהכרטיס המלא (lead-card-panel)
  "screening_score",
  "interview_date",
  "interview_notes",
  "hired_client",
  "hired_position",
  "rejection_reason",
  "start_date",
  "arrival_date",
  "employment_end_date",
]);

const DATE_FIELDS = new Set(["start_date", "arrival_date", "employment_end_date"]);
const SNAPSHOT_COLUMNS =
  "name, phone, email, job_title, location, experience, age, screening_score, interview_date, " +
  "interview_notes, hired_client, hired_position, rejection_reason, start_date, arrival_date, employment_end_date";

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
    } else if (key === "phone") {
      updateData.phone = normalizePhone(String(value ?? ""));
    } else if (key === "screening_score") {
      if (value === "" || value == null) {
        updateData.screening_score = null;
      } else {
        const n = typeof value === "number" ? value : parseInt(String(value), 10);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return NextResponse.json({ error: "ציון סינון חייב להיות בין 0 ל-100" }, { status: 400 });
        }
        updateData.screening_score = n;
      }
    } else if (DATE_FIELDS.has(key)) {
      const s = String(value ?? "").trim();
      if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return NextResponse.json({ error: `תאריך לא תקין: ${key}` }, { status: 400 });
      }
      updateData[key] = s || null;
    } else if (key === "interview_date") {
      const s = String(value ?? "").trim();
      if (s && Number.isNaN(new Date(s).getTime())) {
        return NextResponse.json({ error: "תאריך ראיון לא תקין" }, { status: 400 });
      }
      updateData.interview_date = s ? new Date(s).toISOString() : null;
    } else if (key === "hired_client") {
      const s = String(value ?? "").trim();
      updateData.hired_client = s ? (await normalizeEmployerName(s)).normalized : null;
    } else {
      const s = String(value ?? "").trim();
      updateData[key] = s || null;
    }
  }

  // One candidate = one phone: another card already owns this number?
  if (typeof updateData.phone === "string") {
    const existing = await findLeadByPhone(supabase, updateData.phone, leadId);
    if (existing) return NextResponse.json(duplicatePhonePayload(existing), { status: 409 });
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "אין שדות לעדכון" }, { status: 400 });
  }

  // snapshot before the write so the audit row carries a real from→to diff
  const { data: before } = await supabase
    .from("leads")
    .select(SNAPSHOT_COLUMNS)
    .eq("id", leadId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", leadId)
    .select("id, " + SNAPSHOT_COLUMNS)
    .single();

  if (error) {
    if (isPhoneUniqueViolation(error) && typeof updateData.phone === "string") {
      const existing = await findLeadByPhone(supabase, updateData.phone, leadId);
      if (existing) return NextResponse.json(duplicatePhonePayload(existing), { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const changes = diffFields(before as Record<string, unknown> | null, updateData);
  if (changes) {
    await logAudit({
      action: "update",
      leadId,
      actor: user.email,
      changes,
      request,
      meta: { via: "PATCH /api/leads/[id]" },
    });
  }

  return NextResponse.json({ lead: data });
}
