// סטטוס בקשת חתימה דיגיטלית — משותף לדשבורד ולדף החתימה הציבורי.
// מופרד מקבצי "use server" מאותה סיבה כמו leadDocTypes.ts.

export type SignatureStatus = "pending" | "signed" | "cancelled";

export interface SignatureRequest {
  id: string;
  lead_id: string;
  document_id: string | null;
  signed_document_id: string | null;
  token: string;
  status: SignatureStatus;
  doc_type: string;
  file_name: string;
  sent_by: string | null;
  sent_at: string;
  expires_at: string;
  signer_name: string | null;
  signed_at: string | null;
}

/** MIME types שאפשר לשלוח לחתימה (מוטבעים ל-PDF בשרת). */
export const SIGNABLE_MIMES = ["application/pdf", "image/png", "image/jpeg"];

export function isSignableMime(mime: string | null | undefined): boolean {
  return !!mime && SIGNABLE_MIMES.includes(mime);
}
