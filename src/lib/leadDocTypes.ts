// סוגי מסמכי ליד — מופרד מ-leadDocuments.ts כי קובץ "use server"
// רשאי לייצא רק פונקציות אסינכרוניות (Next 16 מפיל את הרינדור אחרת).
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
