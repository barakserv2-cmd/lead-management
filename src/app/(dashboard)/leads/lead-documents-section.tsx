"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  uploadLeadDocument,
  getLeadDocuments,
  deleteLeadDocument,
  LEAD_DOC_TYPES,
  type LeadDocument,
  type LeadDocType,
} from "@/lib/actions/leadDocuments";

// Render order — "other" goes last
const KNOWN_TYPES: LeadDocType[] = [
  "form_101",
  "id_photo",
  "employment_terms",
  "equipment_commitment",
  "housing_commitment",
];

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function LeadDocumentsSection({ leadId }: { leadId: string }) {
  const [docs, setDocs] = useState<LeadDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<LeadDocType | null>(null);
  const fileInputs = useRef<Partial<Record<LeadDocType, HTMLInputElement | null>>>({});

  async function refresh() {
    setLoading(true);
    const result = await getLeadDocuments(leadId);
    setDocs(result);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  function triggerUpload(type: LeadDocType) {
    fileInputs.current[type]?.click();
  }

  async function handleFile(type: LeadDocType, file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("הקובץ גדול מ-10MB");
      return;
    }
    setUploadingType(type);
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("docType", type);
    fd.set("file", file);
    const res = await uploadLeadDocument(fd);
    setUploadingType(null);
    if (!res.success) {
      toast.error(res.error ?? "העלאה נכשלה");
      return;
    }
    toast.success("הקובץ הועלה");
    await refresh();
  }

  async function handleDelete(docId: string) {
    if (!confirm("למחוק את המסמך?")) return;
    const res = await deleteLeadDocument(docId);
    if (!res.success) {
      toast.error(res.error ?? "מחיקה נכשלה");
      return;
    }
    toast.success("נמחק");
    await refresh();
  }

  const docsByType = new Map<LeadDocType, LeadDocument>();
  const otherDocs: LeadDocument[] = [];
  for (const d of docs) {
    if (d.doc_type === "other") otherDocs.push(d);
    else docsByType.set(d.doc_type, d);
  }

  return (
    <div className="border-t border-gray-200 mt-4 pt-4">
      <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        מסמכים
      </h4>

      {loading ? (
        <p className="text-xs text-gray-400 text-center py-3">טוען...</p>
      ) : (
        <div className="space-y-1.5">
          {KNOWN_TYPES.map((type) => {
            const doc = docsByType.get(type);
            const label = LEAD_DOC_TYPES[type];
            return (
              <div
                key={type}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-xs ${
                  doc ? "bg-green-50/40 border-green-200" : "bg-gray-50/60 border-gray-200"
                }`}
              >
                <input
                  type="file"
                  ref={(el) => { fileInputs.current[type] = el; }}
                  onChange={(e) => handleFile(type, e.target.files?.[0])}
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx"
                />
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
                      doc ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                  <span className="font-medium text-gray-800 truncate">{label}</span>
                  {doc && (
                    <span className="text-gray-400 text-[10px] truncate">
                      {doc.file_name} · {formatSize(doc.file_size)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {doc && doc.signed_url && (
                    <a
                      href={doc.signed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-1.5 py-0.5 rounded text-cyan-700 hover:bg-cyan-100 transition-colors"
                      title="פתח"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        <path d="M15 3h6v6" />
                        <path d="m10 14 11-11" />
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      </svg>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => triggerUpload(type)}
                    disabled={uploadingType === type}
                    className="px-2 py-0.5 rounded text-cyan-700 hover:bg-cyan-100 transition-colors disabled:opacity-50"
                  >
                    {uploadingType === type ? "..." : doc ? "החלף" : "העלה"}
                  </button>
                  {doc && (
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id)}
                      className="px-1.5 py-0.5 rounded text-red-600 hover:bg-red-100 transition-colors"
                      title="מחק"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* "Other" row — supports multiple files */}
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border bg-gray-50/60 border-gray-200 text-xs">
            <input
              type="file"
              ref={(el) => { fileInputs.current.other = el; }}
              onChange={(e) => handleFile("other", e.target.files?.[0])}
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx"
            />
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-gray-300" />
              <span className="font-medium text-gray-800">מסמכים נוספים</span>
              {otherDocs.length > 0 && (
                <span className="text-gray-400 text-[10px]">({otherDocs.length})</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => triggerUpload("other")}
              disabled={uploadingType === "other"}
              className="px-2 py-0.5 rounded text-cyan-700 hover:bg-cyan-100 transition-colors disabled:opacity-50"
            >
              {uploadingType === "other" ? "..." : "העלה"}
            </button>
          </div>

          {otherDocs.length > 0 && (
            <div className="pl-3 space-y-1">
              {otherDocs.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded text-[11px] text-gray-700">
                  <a
                    href={d.signed_url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:text-cyan-700"
                  >
                    📄 {d.file_name} · {formatSize(d.file_size)}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(d.id)}
                    className="text-red-600 hover:bg-red-100 px-1 rounded"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
