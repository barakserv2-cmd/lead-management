import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { sendSignatureRequestForDoc, cancelPendingForDocs } from "@/lib/signatureSend";

const BUCKET = "lead-documents";

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

// POST — שליחת תבנית מהספרייה לחתימה: מעתיק את קובץ התבנית
// לתיקיית הליד, יוצר lead_document (מחליף קיים מאותו סוג),
// ואז שולח בקשת חתימה רגילה.
export async function POST(req: NextRequest) {
  const cookieClient = await createCookieClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { leadId, templateId } = await req.json();
    if (!leadId || !templateId) {
      return NextResponse.json({ success: false, error: "חסרים פרמטרים" }, { status: 400 });
    }

    const admin = getAdmin();

    const { data: template } = await admin
      .from("signature_templates")
      .select("id, name, doc_type, file_path, file_name, mime_type, file_size, required_fields")
      .eq("id", templateId)
      .eq("is_active", true)
      .maybeSingle();
    if (!template) {
      return NextResponse.json({ success: false, error: "תבנית לא נמצאה" }, { status: 404 });
    }

    // העתקת קובץ התבנית לתיקיית הליד
    const ext = template.file_name.match(/\.[^.]+$/)?.[0] ?? ".pdf";
    const destPath = `${leadId}/${template.doc_type}_${Date.now()}_template${ext}`;
    const { error: copyErr } = await admin.storage
      .from(BUCKET)
      .copy(template.file_path, destPath);
    if (copyErr) {
      return NextResponse.json(
        { success: false, error: `שגיאה בהעתקת התבנית: ${copyErr.message}` },
        { status: 500 }
      );
    }

    // מסמך מאותו סוג מחליף את הקיים (כמו העלאה ידנית) — חוץ מ'אחר'
    if (template.doc_type !== "other") {
      const { data: existing } = await admin
        .from("lead_documents")
        .select("id, file_path")
        .eq("lead_id", leadId)
        .eq("doc_type", template.doc_type);
      if (existing && existing.length > 0) {
        await cancelPendingForDocs(existing.map((d) => d.id));
        await admin.storage.from(BUCKET).remove(existing.map((d) => d.file_path));
        await admin.from("lead_documents").delete().in("id", existing.map((d) => d.id));
      }
    }

    const { data: doc, error: insertErr } = await admin
      .from("lead_documents")
      .insert({
        lead_id: leadId,
        doc_type: template.doc_type,
        file_path: destPath,
        file_name: template.file_name,
        mime_type: template.mime_type,
        file_size: template.file_size,
      })
      .select("id, lead_id, doc_type, file_name, mime_type, file_size, file_path, uploaded_at")
      .single();
    if (insertErr || !doc) {
      await admin.storage.from(BUCKET).remove([destPath]);
      return NextResponse.json(
        { success: false, error: `שגיאה ביצירת המסמך: ${insertErr?.message ?? "unknown"}` },
        { status: 500 }
      );
    }

    const result = await sendSignatureRequestForDoc({
      doc,
      userEmail: user.email,
      appBase: appBase(req),
      requiredFields: template.required_fields,
    });
    const { httpStatus, ...body } = result;
    return NextResponse.json(
      { ...body, document: { ...doc, signed_url: null } },
      httpStatus ? { status: httpStatus } : undefined
    );
  } catch (err) {
    console.error("[Sign Send Template] Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" },
      { status: 500 }
    );
  }
}
