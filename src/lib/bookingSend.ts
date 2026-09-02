// ============================================================
// Booking link sender — שליחת קישור תיאום עצמי לליד
// ============================================================
//
// משמש את הבוט (בסוף סינון מוצלח) ובעתיד כל זרימה אוטומטית אחרת.
// יוצר טוקן (ומבטל קודמים), בוחר רכזת ללוח (הכי פחות עמוסה היום),
// שולח את הקישור ומתעד בכרטיס.

import { createClient as createServerClient } from "@supabase/supabase-js";
import {
  sendWhatsAppMessage,
  businessAccount,
  type WhatsAppAccount,
} from "@/lib/whatsappService";
import { newBookingToken } from "@/lib/booking";

function admin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** רכזת עם לוח זמינות, הכי מעט לינקים שנשלחו היום — איזון טבעי. */
async function pickCalendarRecruiter(db: ReturnType<typeof admin>): Promise<string | null> {
  const { data: withWindows } = await db
    .from("availability_slots")
    .select("recruiter_email")
    .eq("active", true);
  const recruiters = Array.from(new Set((withWindows ?? []).map((r) => String(r.recruiter_email))));
  if (recruiters.length === 0) return null;

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: todays } = await db
    .from("booking_tokens")
    .select("recruiter_email")
    .gte("created_at", dayStart.toISOString());
  const counts = new Map<string, number>(recruiters.map((r) => [r, 0]));
  for (const t of todays ?? []) {
    const k = String(t.recruiter_email);
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = recruiters[0];
  for (const r of recruiters) {
    if ((counts.get(r) ?? 0) < (counts.get(best) ?? 0)) best = r;
  }
  return best;
}

export interface BookingLinkResult {
  success: boolean;
  link?: string;
  error?: string;
}

/**
 * שולח לליד קישור תיאום ראיון (טלפוני כברירת מחדל) מהחשבון הנתון —
 * בזרימת הבוט: אותו מספר שמנהל את השיחה.
 */
export async function sendBookingLinkToLead(
  leadId: string,
  opts: {
    account?: WhatsAppAccount;
    interviewType?: "phone" | "in_person" | "video";
    createdBy?: string;
  } = {}
): Promise<BookingLinkResult> {
  const db = admin();
  const interviewType = opts.interviewType ?? "phone";

  const { data: lead } = await db
    .from("leads")
    .select("id, name, phone, do_not_contact")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.phone) return { success: false, error: "לליד אין טלפון" };
  if (lead.do_not_contact) return { success: false, error: "opt-out" };

  const recruiter = await pickCalendarRecruiter(db);
  if (!recruiter) return { success: false, error: "אין רכזת עם לוח זמינות" };

  await db
    .from("booking_tokens")
    .update({ status: "cancelled" })
    .eq("lead_id", leadId)
    .eq("status", "pending");

  const token = newBookingToken();
  const { error: insErr } = await db.from("booking_tokens").insert({
    lead_id: leadId,
    recruiter_email: recruiter,
    token,
    interview_type: interviewType,
    sent_by: opts.createdBy ?? "ai-recruiter",
  });
  if (insErr) return { success: false, error: insErr.message };

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://lead-management-umber.vercel.app";
  const link = `${base}/book/${token}`;
  const message =
    `הנה הקישור לבחירת מועד לראיון הטלפוני שלך 👇\n${link}\n` +
    `לוקח 10 שניות — בוחרים שעה שנוחה לך ומאשרים. אפשר גם לשנות או לבטל דרך אותו קישור 🙂`;

  const account = opts.account ?? businessAccount();
  const res = await sendWhatsAppMessage(lead.phone, message, account);
  if (!res.success) return { success: false, error: res.error, link };

  await db.from("messages").insert({
    lead_id: leadId,
    role: "assistant",
    content: message,
    via_instance: account.instanceId,
  });
  await db.from("lead_events").insert({
    lead_id: leadId,
    event_type: "ראיון",
    event_text: "הבוט שלח קישור תיאום ראיון עצמי בסוף הסינון",
    created_by: opts.createdBy ?? "ai-recruiter",
  });

  return { success: true, link };
}
