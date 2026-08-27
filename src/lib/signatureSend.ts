// ============================================================
// signatureSend — הלוגיקה המשותפת לשליחת בקשת חתימה על מסמך ליד:
// ביטול בקשות קודמות, יצירת טוקן, הודעת וואטסאפ מהמספר של
// הרכזת, ותיעוד בצ'אט וביומן. משמש גם שליחת מסמך קיים וגם
// שליחת תבנית מהספרייה.
// ============================================================

import { randomBytes } from "crypto";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage, resolveSender } from "@/lib/whatsappService";
import { getMessageScope } from "@/lib/messageVisibility";
import { LEAD_DOC_TYPES, type LeadDocType } from "@/lib/leadDocTypes";
import {
  DEFAULT_REQUIRED_FIELDS,
  sanitizeFieldPositions,
  sanitizeRequiredFields,
  type SignatureRequest,
} from "@/lib/signatureTypes";

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface SendSignatureResult {
  success: boolean;
  request?: SignatureRequest;
  link?: string;
  error?: string;
  httpStatus?: number;
  detail?: string;
}

export async function sendSignatureRequestForDoc(opts: {
  doc: { id: string; lead_id: string; doc_type: string; file_name: string };
  userEmail: string | null | undefined;
  appBase: string;
  /** שדות שהמועמד חייב למלא לפני חתימה (ברירת מחדל: שם + ת"ז) */
  requiredFields?: unknown;
  /** משבצות ממופות על גבי המסמך (מהתבנית) */
  fieldPositions?: unknown;
}): Promise<SendSignatureResult> {
  const { doc, userEmail, appBase } = opts;
  const requiredFields = opts.requiredFields
    ? sanitizeRequiredFields(opts.requiredFields)
    : DEFAULT_REQUIRED_FIELDS;
  const fieldPositions = sanitizeFieldPositions(opts.fieldPositions);
  const admin = getAdmin();

  const { data: lead } = await admin
    .from("leads")
    .select("id, phone, name")
    .eq("id", doc.lead_id)
    .single();
  if (!lead) return { success: false, error: "ליד לא נמצא", httpStatus: 404 };
  if (!lead.phone) return { success: false, error: "לליד אין מספר טלפון", httpStatus: 400 };

  const scope = await getMessageScope(userEmail);
  if (!scope.canSend) {
    return {
      success: false,
      error: "אין לך מספר וואטסאפ מחובר — חבר מספר בהגדרות > הוואטסאפ שלי.",
      httpStatus: 403,
    };
  }
  const sender = await resolveSender(userEmail);

  // בקשה חדשה מבטלת בקשות pending קודמות על אותו מסמך
  await admin
    .from("signature_requests")
    .update({ status: "cancelled" })
    .eq("document_id", doc.id)
    .eq("status", "pending");

  const token = randomBytes(24).toString("base64url");
  const { data: request, error: insertErr } = await admin
    .from("signature_requests")
    .insert({
      lead_id: doc.lead_id,
      document_id: doc.id,
      token,
      doc_type: doc.doc_type,
      file_name: doc.file_name,
      sent_by: userEmail?.toLowerCase() ?? null,
      required_fields: requiredFields,
      field_positions: fieldPositions.length > 0 ? fieldPositions : null,
    })
    .select()
    .single();
  if (insertErr || !request) {
    return {
      success: false,
      error: `שגיאה ביצירת הבקשה: ${insertErr?.message ?? "unknown"}`,
      httpStatus: 500,
    };
  }

  const label = LEAD_DOC_TYPES[doc.doc_type as LeadDocType] ?? doc.doc_type;
  const link = `${appBase}/sign/${token}`;
  const firstName = (lead.name ?? "").trim().split(/\s+/)[0] || "היי";
  const message =
    `היי ${firstName} 👋\n` +
    `מברק שירותים — יש מסמך שמחכה לחתימה שלך: *${label}*\n\n` +
    `לחתימה דיגיטלית מהנייד (לוקח דקה):\n${link}\n\n` +
    `הקישור בתוקף ל-7 ימים. אם משהו לא ברור — פשוט תכתבו לנו כאן 🙂`;

  await admin.from("messages").insert({
    lead_id: doc.lead_id,
    role: "recruiter",
    content: message,
    sent_by: userEmail ?? null,
    via_instance: sender.instanceId,
  });

  await admin.from("lead_events").insert({
    lead_id: doc.lead_id,
    event_type: "מסמכים",
    event_text: `נשלח לחתימה דיגיטלית: ${label} (${doc.file_name})`,
    created_by: userEmail ?? "מערכת",
  });

  const result = await sendWhatsAppMessage(lead.phone, message, sender);
  if (!result.success) {
    // הבקשה קיימת והקישור תקף — הרכזת יכולה להעתיק ולשלוח ידנית
    return {
      success: false,
      request: request as SignatureRequest,
      link,
      error: "הבקשה נוצרה אבל הוואטסאפ לא נשלח — אפשר להעתיק את הקישור ולשלוח ידנית.",
      detail: result.error,
    };
  }

  return { success: true, request: request as SignatureRequest, link };
}

/** מבטל בקשות pending שמפנות למסמכים שנמחקים (החלפת קובץ בסלוט). */
export async function cancelPendingForDocs(docIds: string[]): Promise<void> {
  if (docIds.length === 0) return;
  await getAdmin()
    .from("signature_requests")
    .update({ status: "cancelled" })
    .in("document_id", docIds)
    .eq("status", "pending");
}
