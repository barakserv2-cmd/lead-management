import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage, resolveSender } from "@/lib/whatsappService";
import { getMessageScope } from "@/lib/messageVisibility";
import { LEAD_DOC_TYPES, type LeadDocType } from "@/lib/leadDocTypes";
import { isSignableMime } from "@/lib/signatureTypes";

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function appBase(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : req.nextUrl.origin)
  );
}

// POST — יצירת בקשת חתימה ושליחת הקישור למועמד בוואטסאפ
export async function POST(req: NextRequest) {
  const cookieClient = await createCookieClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { documentId } = await req.json();
    if (!documentId) {
      return NextResponse.json({ success: false, error: "חסר documentId" }, { status: 400 });
    }

    const admin = getAdmin();

    const { data: doc } = await admin
      .from("lead_documents")
      .select("id, lead_id, doc_type, file_name, mime_type")
      .eq("id", documentId)
      .single();
    if (!doc) {
      return NextResponse.json({ success: false, error: "מסמך לא נמצא" }, { status: 404 });
    }
    if (!isSignableMime(doc.mime_type)) {
      return NextResponse.json(
        { success: false, error: "אפשר לשלוח לחתימה רק PDF או תמונה (JPG/PNG)" },
        { status: 400 }
      );
    }

    const { data: lead } = await admin
      .from("leads")
      .select("id, phone, name")
      .eq("id", doc.lead_id)
      .single();
    if (!lead) {
      return NextResponse.json({ success: false, error: "ליד לא נמצא" }, { status: 404 });
    }
    if (!lead.phone) {
      return NextResponse.json({ success: false, error: "לליד אין מספר טלפון" }, { status: 400 });
    }

    const scope = await getMessageScope(user.email);
    if (!scope.canSend) {
      return NextResponse.json(
        { success: false, error: "אין לך מספר וואטסאפ מחובר — חבר מספר בהגדרות > הוואטסאפ שלי." },
        { status: 403 }
      );
    }
    const sender = await resolveSender(user.email);

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
        sent_by: user.email?.toLowerCase() ?? null,
      })
      .select()
      .single();
    if (insertErr || !request) {
      return NextResponse.json(
        { success: false, error: `שגיאה ביצירת הבקשה: ${insertErr?.message ?? "unknown"}` },
        { status: 500 }
      );
    }

    const label = LEAD_DOC_TYPES[doc.doc_type as LeadDocType] ?? doc.doc_type;
    const link = `${appBase(req)}/sign/${token}`;
    const firstName = (lead.name ?? "").trim().split(/\s+/)[0] || "היי";
    const message =
      `היי ${firstName} 👋\n` +
      `מברק שירותים — יש מסמך שמחכה לחתימה שלך: *${label}*\n\n` +
      `לחתימה דיגיטלית מהנייד (לוקח דקה):\n${link}\n\n` +
      `הקישור בתוקף ל-7 ימים. אם משהו לא ברור — פשוט תכתבו לנו כאן 🙂`;

    // ההודעה נרשמת בצ'אט של הליד כמו שליחה ידנית
    await admin.from("messages").insert({
      lead_id: doc.lead_id,
      role: "recruiter",
      content: message,
      sent_by: user.email ?? null,
      via_instance: sender.instanceId,
    });

    await admin.from("lead_events").insert({
      lead_id: doc.lead_id,
      event_type: "מסמכים",
      event_text: `נשלח לחתימה דיגיטלית: ${label} (${doc.file_name})`,
      created_by: user.email ?? "מערכת",
    });

    const result = await sendWhatsAppMessage(lead.phone, message, sender);
    if (!result.success) {
      // הבקשה קיימת והקישור תקף — הרכזת יכולה להעתיק ולשלוח ידנית
      return NextResponse.json({
        success: false,
        request,
        link,
        error: "הבקשה נוצרה אבל הוואטסאפ לא נשלח — אפשר להעתיק את הקישור ולשלוח ידנית.",
        detail: result.error,
      });
    }

    return NextResponse.json({ success: true, request, link });
  } catch (err) {
    console.error("[Sign Send] Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" },
      { status: 500 }
    );
  }
}
