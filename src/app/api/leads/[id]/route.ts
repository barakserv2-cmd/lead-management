import { validateInterviewLocal } from "@/lib/interviewTime";
import { ensureClosuresLoaded } from "@/lib/closures";
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
  "interview_type",
  "interview_notes",
  "hired_client",
  "hired_position",
  "rejection_reason",
  "start_date",
  "arrival_date",
  "employment_end_date",
  // הערות חופשיות — הוצגו בכרטיס לקריאה בלבד ולא היה שום מסך שמאפשר לתקן
  "notes",
  "followup_notes",
]);

const DATE_FIELDS = new Set(["start_date", "arrival_date", "employment_end_date"]);
// notes/followup_notes belong here: without them the audit diff carried no
// record of a note being replaced, so "my note disappeared" could not be
// answered from the log at all.
const SNAPSHOT_COLUMNS =
  "name, phone, email, job_title, location, experience, age, screening_score, interview_date, " +
  "interview_notes, hired_client, hired_position, rejection_reason, start_date, arrival_date, " +
  "employment_end_date, notes, followup_notes";

// קריאת השדות שהדיאלוגים צריכים כדי לפתוח עם הערך הקיים ולא לדרוס אותו
// (למשל תאריך תחילת עבודה כשמעבירים ל"התחיל לעבוד").
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;

  const { data, error } = await supabase
    .from("leads")
    .select(`id, status, ${SNAPSHOT_COLUMNS}`)
    .eq("id", leadId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "ליד לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({ lead: data });
}

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
  let blankedNote = false;
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
      // מגיע כשעון קיר ישראלי ("YYYY-MM-DDTHH:mm") ונשמר כמו שהוא עם תווית UTC —
      // אותה קונבנציה כמו דיאלוג קביעת הראיון (changeLeadStatus). אין להמיר ל-ISO.
      const s = String(value ?? "").trim();
      if (s) {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) || Number.isNaN(new Date(s).getTime())) {
          return NextResponse.json({ error: "תאריך ראיון לא תקין" }, { status: 400 });
        }
        await ensureClosuresLoaded();
        const err = validateInterviewLocal(s);
        if (err) return NextResponse.json({ error: err }, { status: 400 });
      }
      updateData.interview_date = s || null;
    } else if (key === "interview_type") {
      const s = String(value ?? "").trim();
      if (s && s !== "in_person" && s !== "video" && s !== "phone") {
        return NextResponse.json({ error: "סוג ראיון לא חוקי" }, { status: 400 });
      }
      updateData.interview_type = s || null;
    } else if (key === "hired_client") {
      const s = String(value ?? "").trim();
      updateData.hired_client = s ? (await normalizeEmployerName(s)).normalized : null;
    } else if (key === "notes" || key === "followup_notes") {
      // Blanking a note has to be deliberate. This route used to turn an empty
      // textarea straight into NULL with no journal copy, so a save from a card
      // whose editor had opened stale erased what a recruiter had written and
      // left no trace of it — which is how notes "disappeared" (three reports,
      // 8–10 Sep). Emptying is now refused; text is only ever replaced by text.
      const s = String(value ?? "").trim();
      if (!s) { blankedNote = true; continue; }
      updateData[key] = s;
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
    return NextResponse.json(
      blankedNote
        ? { error: "לא ניתן לרוקן הערה קיימת מכאן — אפשר להחליף אותה בטקסט אחר" }
        : { error: "אין שדות לעדכון" },
      { status: 400 }
    );
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

  // A note saved from the card sheet used to leave no copy anywhere, so the
  // text existed in exactly one cell and the next save overwrote it. Mirror it
  // into the journal like the notes route does — the journal is append-only,
  // so an overwritten note is still readable there.
  const noteText = typeof updateData.notes === "string" ? updateData.notes : null;
  if (noteText && noteText !== (before as Record<string, unknown> | null)?.notes) {
    await supabase
      .from("lead_events")
      .insert({
        lead_id: leadId,
        event_type: "הערה",
        event_text: noteText.slice(0, 1000),
        created_by: user.email,
      })
      .then(() => undefined, () => undefined);
  }

  return NextResponse.json({ lead: data });
}
