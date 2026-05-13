"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const BUCKET = "lead-documents";

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const LEAD_DOC_TYPES = {
  form_101: "טופס 101",
  id_photo: "צילום תז",
  employment_terms: "תנאי העסקה",
  equipment_commitment: "התחייבות לציוד",
  housing_commitment: "התחייבות לדיור",
  other: "אחר",
} as const;

export type LeadDocType = keyof typeof LEAD_DOC_TYPES;

export interface LeadDocument {
  id: string;
  lead_id: string;
  doc_type: LeadDocType;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string;
  signed_url: string | null; // populated when listing
}

/**
 * Upload a single document for a lead. Replaces any existing doc of the same
 * type (one per type per lead, except 'other' which can have multiple).
 */
export async function uploadLeadDocument(formData: FormData): Promise<{
  success: boolean;
  error?: string;
  document?: LeadDocument;
}> {
  const leadId = String(formData.get("leadId") ?? "");
  const docType = String(formData.get("docType") ?? "") as LeadDocType;
  const file = formData.get("file") as File | null;

  if (!leadId || !docType || !file) {
    return { success: false, error: "חסרים נתונים" };
  }
  if (!(docType in LEAD_DOC_TYPES)) {
    return { success: false, error: "סוג מסמך לא חוקי" };
  }

  const admin = getAdmin();

  // Build the storage path: <leadId>/<docType>_<timestamp>_<safe-filename>
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${leadId}/${docType}_${Date.now()}_${safeName}`;

  // If this doc type is not 'other', remove the previous file of same type first
  if (docType !== "other") {
    const { data: existing } = await admin
      .from("lead_documents")
      .select("id, file_path")
      .eq("lead_id", leadId)
      .eq("doc_type", docType);
    if (existing && existing.length > 0) {
      const paths = existing.map((d) => d.file_path);
      await admin.storage.from(BUCKET).remove(paths);
      await admin
        .from("lead_documents")
        .delete()
        .in("id", existing.map((d) => d.id));
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, arrayBuffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadErr) {
    return { success: false, error: `העלאה נכשלה: ${uploadErr.message}` };
  }

  // Resolve current user (best-effort)
  let uploadedBy: string | null = null;
  try {
    const cookieClient = await createCookieClient();
    const { data: { user } } = await cookieClient.auth.getUser();
    uploadedBy = user?.id ?? null;
  } catch {
    /* anon — fine */
  }

  const { data: inserted, error: insertErr } = await admin
    .from("lead_documents")
    .insert({
      lead_id: leadId,
      doc_type: docType,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by: uploadedBy,
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    // Roll back the storage upload
    await admin.storage.from(BUCKET).remove([path]);
    return { success: false, error: `שגיאה בשמירה: ${insertErr?.message ?? "unknown"}` };
  }

  revalidatePath("/leads");

  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);

  return {
    success: true,
    document: { ...(inserted as LeadDocument), signed_url: signed?.signedUrl ?? null },
  };
}

export async function getLeadDocuments(leadId: string): Promise<LeadDocument[]> {
  const admin = getAdmin();
  const { data, error } = await admin
    .from("lead_documents")
    .select("*")
    .eq("lead_id", leadId)
    .order("uploaded_at", { ascending: false });
  if (error || !data) return [];
  // No signed URLs here — they're slow (N+1 round-trips). The UI now requests
  // a signed URL on demand via `signLeadDocument()` when the user clicks open.
  return (data as LeadDocument[]).map((d) => ({ ...d, signed_url: null }));
}

export async function signLeadDocument(docId: string): Promise<{ url: string | null; error?: string }> {
  const admin = getAdmin();
  const { data: doc } = await admin
    .from("lead_documents")
    .select("file_path")
    .eq("id", docId)
    .single();
  if (!doc) return { url: null, error: "מסמך לא נמצא" };
  const { data: signed, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 60 * 60);
  if (error || !signed) return { url: null, error: error?.message ?? "שגיאה ביצירת קישור" };
  return { url: signed.signedUrl };
}

export async function deleteLeadDocument(docId: string): Promise<{ success: boolean; error?: string }> {
  const admin = getAdmin();
  const { data: doc } = await admin
    .from("lead_documents")
    .select("file_path")
    .eq("id", docId)
    .single();
  if (!doc) return { success: false, error: "מסמך לא נמצא" };

  await admin.storage.from(BUCKET).remove([doc.file_path]);
  const { error } = await admin.from("lead_documents").delete().eq("id", docId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/leads");
  return { success: true };
}
