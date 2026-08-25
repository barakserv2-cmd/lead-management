import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { sendSignatureRequestForDoc } from "@/lib/signatureSend";
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

// POST — יצירת בקשת חתימה על מסמך קיים ושליחת הקישור בוואטסאפ
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

    const { data: doc } = await getAdmin()
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

    const result = await sendSignatureRequestForDoc({
      doc,
      userEmail: user.email,
      appBase: appBase(req),
    });
    const { httpStatus, ...body } = result;
    return NextResponse.json(body, httpStatus ? { status: httpStatus } : undefined);
  } catch (err) {
    console.error("[Sign Send] Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" },
      { status: 500 }
    );
  }
}
