import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { getMessageScope } from "@/lib/messageVisibility";
import {
  listApprovedTemplates,
  renderTemplateBody,
  resolveSender,
  sendWhatsAppTemplate,
} from "@/lib/whatsappService";

function admin() {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// POST — רכזת שולחת תבנית מאושרת מתוך הצ'אט.
//
// 17.09: מחוץ לחלון 24 השעות V1 חסם כל הודעה, והרכזת נשארה רק עם הטלפון.
// תבנית מאושרת עוברת גם מחוץ לחלון, ולכן היא הדרך לפנות מתוך המערכת.
// ההודעה נשמרת בצ'אט עם הטקסט המלא ומקבלת סימני מסירה כמו כל הודעה.
export async function POST(req: NextRequest) {
  const cookieClient = await createCookieClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { leadId, name, params } = (await req.json().catch(() => ({}))) as {
    leadId?: string;
    name?: string;
    params?: string[];
  };
  if (!leadId || !name) {
    return NextResponse.json({ success: false, error: "חסרים פרמטרים (leadId, name)" }, { status: 400 });
  }

  const scope = await getMessageScope(user.email);
  if (!scope.canSend) {
    return NextResponse.json({ success: false, error: "אין לך מספר וואטסאפ מחובר — אי אפשר לשלוח." }, { status: 403 });
  }
  const sender = await resolveSender(user.email);

  // התבנית נבדקת מול הרשימה המאושרת — לא סומכים על שם שהגיע מהדפדפן
  const template = (await listApprovedTemplates(sender)).find((t) => t.name === name);
  if (!template) {
    return NextResponse.json({ success: false, error: "התבנית לא מאושרת למספר שלך" }, { status: 400 });
  }
  const values = (params ?? []).map((p) => String(p ?? "").trim()).slice(0, template.paramCount);
  if (values.length < template.paramCount || values.some((p) => !p)) {
    return NextResponse.json({ success: false, error: "צריך למלא את כל השדות בתבנית" }, { status: 400 });
  }

  const db = admin();
  const { data: lead } = await db.from("leads").select("id, phone").eq("id", leadId).single();
  if (!lead?.phone) {
    return NextResponse.json({ success: false, error: "לליד אין מספר טלפון" }, { status: 404 });
  }

  const body = renderTemplateBody(template.body, values);
  const result = await sendWhatsAppTemplate(
    lead.phone,
    { name: template.name, language: template.language, params: values },
    sender
  );

  await db.from("messages").insert({
    lead_id: leadId,
    role: "recruiter",
    content: body,
    sent_by: user.email ?? null,
    via_instance: sender.instanceId,
    ...(result.success
      ? { provider_msg_id: result.idMessage ?? null, delivery_status: "sent" }
      : { delivery_status: "failed", delivery_error: result.error ?? "השליחה נכשלה" }),
    delivery_updated_at: new Date().toISOString(),
  });

  if (!result.success) {
    return NextResponse.json({ success: false, savedToChat: true, error: `התבנית לא נשלחה — ${result.error ?? "שגיאה"}` });
  }

  const { forwardReplyToMachine } = await import("@/lib/machineBridge");
  await forwardReplyToMachine(lead.phone, body, "human");
  return NextResponse.json({ success: true });
}
