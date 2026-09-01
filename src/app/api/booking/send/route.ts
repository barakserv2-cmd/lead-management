import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";
import { resolveSender, sendWhatsAppMessage } from "@/lib/whatsappService";
import { appBaseUrl, listOpenSlots, newBookingToken } from "@/lib/booking";
import { logAudit } from "@/lib/audit";

// ── שליחת לינק תיאום ראיון עצמי למועמד ─────────────────────
// POST { leadId, interviewType? } — יוצר טוקן (ומבטל קודמים של אותו
// ליד), שולח את הלינק בוואטסאפ מהמספר של הרכזת, ורושם הכל.

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  let body: { leadId?: string; interviewType?: "phone" | "in_person" | "video" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const leadId = body.leadId;
  const interviewType = ["phone", "in_person", "video"].includes(body.interviewType ?? "")
    ? (body.interviewType as "phone" | "in_person" | "video")
    : "phone";
  if (!leadId) return NextResponse.json({ error: "חסר leadId" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: lead } = await admin
    .from("leads")
    .select("id, name, phone")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: "ליד לא נמצא" }, { status: 404 });
  if (!lead.phone) return NextResponse.json({ error: "לליד אין מספר טלפון" }, { status: 400 });

  // בלי חלונות זמינות אין מה להציע — מפנים את הרכזת להגדיר קודם.
  const slots = await listOpenSlots(admin, user.email);
  if (slots.length === 0) {
    return NextResponse.json(
      { error: "אין לך חלונות זמינות פנויים — הגדירי אותם בהגדרות ← זמינות ראיונות" },
      { status: 400 }
    );
  }

  // לינק פעיל אחד לכל ליד: טוקנים קודמים שממתינים מבוטלים.
  await admin
    .from("booking_tokens")
    .update({ status: "cancelled" })
    .eq("lead_id", leadId)
    .eq("status", "pending");

  const token = newBookingToken();
  const { error: insErr } = await admin.from("booking_tokens").insert({
    lead_id: leadId,
    recruiter_email: user.email,
    token,
    interview_type: interviewType,
    sent_by: user.email,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const link = `${appBaseUrl(request.nextUrl.origin)}/book/${token}`;
  const firstName = (lead.name ?? "").trim().split(/\s+/)[0] || "היי";
  const message =
    `שלום ${firstName}, כאן ברק שירותים 🙂\n` +
    `כדי לקבוע את הראיון שלך — בחר/י מועד שנוח לך כאן:\n${link}\n` +
    `הקישור בתוקף ל-7 ימים. אפשר לשנות או לבטל דרך אותו קישור.`;

  const sender = await resolveSender(user.email);
  const sendRes = await sendWhatsAppMessage(lead.phone, message, sender);
  if (!sendRes.success) {
    return NextResponse.json(
      { error: sendRes.error ?? "שליחת הוואטסאפ נכשלה", link },
      { status: 502 }
    );
  }

  await admin.from("messages").insert({
    lead_id: leadId,
    role: "recruiter",
    content: message,
    sent_by: user.email,
    via_instance: sender.instanceId,
  });
  await admin.from("lead_events").insert({
    lead_id: leadId,
    event_type: "ראיון",
    event_text: `נשלח לינק תיאום ראיון עצמי (${interviewType === "video" ? "וידאו" : interviewType === "phone" ? "טלפוני" : "פרונטלי"})`,
    created_by: user.email,
  });
  await logAudit({
    action: "update",
    leadId,
    actor: user.email,
    request,
    meta: { via: "POST /api/booking/send", interview_type: interviewType },
  });

  return NextResponse.json({ ok: true, link });
}
