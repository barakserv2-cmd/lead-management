import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { formatSlot, INTERVIEW_TYPE_LABELS, listOpenSlots } from "@/lib/booking";
import { changeLeadStatus } from "@/lib/actions/changeLeadStatus";
import { LeadStatus } from "@/lib/stateMachine";
import { resolveSender, sendWhatsAppMessage } from "@/lib/whatsappService";

// ── הדף הציבורי של תיאום הראיון (ללא התחברות, טוקן בלבד) ────
//   GET    → מצב הטוקן + החלונות הפנויים
//   POST   → הזמנה / שינוי מועד (אטומי דרך book_interview_slot)
//   DELETE → ביטול הראיון על ידי המועמד
// כמו ב-sign/[token]: service role בלבד, אין anon בדאטאבייס.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TokenRow {
  id: string;
  lead_id: string;
  recruiter_email: string;
  token: string;
  interview_type: "phone" | "in_person" | "video";
  status: "pending" | "booked" | "cancelled";
  booked_start: string | null;
  expires_at: string;
}

async function loadToken(token: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("booking_tokens")
    .select("id, lead_id, recruiter_email, token, interview_type, status, booked_start, expires_at")
    .eq("token", token)
    .maybeSingle();
  return { admin, row: (data as TokenRow | null) ?? null };
}

function isExpired(row: TokenRow): boolean {
  return new Date(row.expires_at).getTime() < Date.now();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { admin, row } = await loadToken(token);

  if (!row || row.status === "cancelled" || (row.status === "pending" && isExpired(row))) {
    return NextResponse.json({ state: "expired" });
  }

  const { data: lead } = await admin
    .from("leads")
    .select("name")
    .eq("id", row.lead_id)
    .maybeSingle();
  const firstName = (lead?.name ?? "").trim().split(/\s+/)[0] || "";

  const slots = await listOpenSlots(admin, row.recruiter_email);

  return NextResponse.json({
    state: row.status === "booked" ? "booked" : "open",
    firstName,
    interviewType: row.interview_type,
    bookedStart: row.booked_start,
    slots,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  let body: { startsAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const startsAt = body.startsAt ?? "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/.test(startsAt)) {
    return NextResponse.json({ error: "מועד לא תקין" }, { status: 400 });
  }

  const { admin, row } = await loadToken(token);
  if (!row || row.status === "cancelled" || (row.status === "pending" && isExpired(row))) {
    return NextResponse.json({ error: "הקישור כבר לא בתוקף — פנו לרכזת" }, { status: 410 });
  }

  // המועד חייב להיות אחד מהחלונות המוצעים כרגע (זמינות + עתיד + לא תפוס).
  // המרוץ האחרון — שני מועמדים על אותו חלון — נתפס באינדקס הייחודי ב-RPC.
  const slots = await listOpenSlots(admin, row.recruiter_email);
  if (!slots.includes(startsAt)) {
    return NextResponse.json(
      { error: "המועד הזה כבר נתפס — בחר/י מועד אחר", slots },
      { status: 409 }
    );
  }

  const { data: rpc, error: rpcErr } = await admin.rpc("book_interview_slot", {
    p_token: token,
    p_starts_at: startsAt,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  const result = rpc as { ok: boolean; error?: string; rebooked?: boolean };
  if (!result.ok) {
    if (result.error === "slot_taken") {
      const fresh = await listOpenSlots(admin, row.recruiter_email);
      return NextResponse.json(
        { error: "המועד הזה בדיוק נתפס — בחר/י מועד אחר", slots: fresh },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "הקישור כבר לא בתוקף — פנו לרכזת" }, { status: 410 });
  }

  // עדכון הליד: interview_date בקונבנציית שעון-הקיר (naive, בלי Z) —
  // בדיוק כמו שהדיאלוג של הרכזת שולח.
  const naiveDate = startsAt.slice(0, 16);
  const { data: lead } = await admin
    .from("leads")
    .select("status, phone, name")
    .eq("id", row.lead_id)
    .maybeSingle();

  const isReschedule = result.rebooked || lead?.status === LeadStatus.INTERVIEW_BOOKED;
  if (isReschedule) {
    // הסטטוס כבר "ראיון נקבע" — עדכון תאריך ישיר (המכונה לא משנה כלום
    // במעבר לאותו סטטוס).
    await admin
      .from("leads")
      .update({ interview_date: naiveDate, interview_type: row.interview_type })
      .eq("id", row.lead_id);
  } else {
    const change = await changeLeadStatus({
      leadId: row.lead_id,
      newStatus: LeadStatus.INTERVIEW_BOOKED,
      userId: "self-booking",
      notes: "המועמד/ת קבע/ה ראיון בתיאום עצמי",
      extra: { interviewDate: naiveDate, interviewType: row.interview_type },
    });
    if (!change.success) {
      // מעבר לא חוקי מהסטטוס הנוכחי — ההזמנה נשמרת, התאריך נכתב ישירות,
      // והרכזת מקבלת דגל לסדר את הפייפליין.
      await admin
        .from("leads")
        .update({
          interview_date: naiveDate,
          interview_type: row.interview_type,
          needs_attention: true,
          needs_attention_at: new Date().toISOString(),
        })
        .eq("id", row.lead_id);
    }
  }

  const f = formatSlot(startsAt);
  await admin.from("lead_events").insert({
    lead_id: row.lead_id,
    event_type: "ראיון",
    event_text: `${isReschedule ? "המועמד/ת שינה/תה את מועד הראיון" : "המועמד/ת קבע/ה ראיון בתיאום עצמי"} — יום ${f.dayName} ${f.date} בשעה ${f.time}`,
    created_by: "self-booking",
  });

  // אישור וואטסאפ — תגובה לפעולה של המועמד, לא כפוף לשעות שקט.
  if (lead?.phone) {
    const typeLabel = INTERVIEW_TYPE_LABELS[row.interview_type] ?? "ראיון";
    const confirmation =
      `הראיון נקבע! 🎯\n` +
      `יום ${f.dayName} ${f.date} בשעה ${f.time} — ${typeLabel}.\n` +
      (row.interview_type === "phone" ? `נתקשר אליך בשעה הזאת — שווה להיות במקום שקט 🙂\n` : "") +
      `צריך לשנות או לבטל? באותו קישור בדיוק.`;
    const sender = await resolveSender(row.recruiter_email);
    const res = await sendWhatsAppMessage(lead.phone, confirmation, sender);
    if (res.success) {
      await admin.from("messages").insert({
        lead_id: row.lead_id,
        role: "recruiter",
        content: confirmation,
        sent_by: "מערכת",
        via_instance: sender.instanceId,
      });
    }
  }

  return NextResponse.json({ ok: true, bookedStart: startsAt });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { admin, row } = await loadToken(token);
  if (!row || row.status !== "booked") {
    return NextResponse.json({ error: "אין ראיון פעיל לביטול" }, { status: 410 });
  }

  await admin
    .from("interview_bookings")
    .update({ status: "cancelled" })
    .eq("token_id", row.id)
    .eq("status", "booked");
  await admin
    .from("booking_tokens")
    .update({ status: "pending", booked_start: null })
    .eq("id", row.id);
  // הסטטוס נשאר לרכזת להחליט; התאריך מתנקה כדי שלוח הראיונות לא יציג
  // פגישה שכבר לא קיימת, והדגל מרים את הליד למעלה במסך היום.
  await admin
    .from("leads")
    .update({
      interview_date: null,
      needs_attention: true,
      needs_attention_at: new Date().toISOString(),
    })
    .eq("id", row.lead_id);
  await admin.from("lead_events").insert({
    lead_id: row.lead_id,
    event_type: "ראיון",
    event_text: "המועמד/ת ביטל/ה את הראיון דרך לינק התיאום — נדרש טיפול",
    created_by: "self-booking",
  });

  return NextResponse.json({ ok: true });
}
