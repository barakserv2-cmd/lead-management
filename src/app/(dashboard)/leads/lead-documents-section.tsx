"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  uploadLeadDocument,
  getLeadDocuments,
  deleteLeadDocument,
  signLeadDocument,
  LEAD_DOC_TYPES,
  type LeadDocument,
  type LeadDocType,
} from "@/lib/actions/leadDocuments";

const KNOWN_TYPES: LeadDocType[] = [
  "form_101",
  "id_photo",
  "employment_terms",
  "equipment_commitment",
  "housing_commitment",
];

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ── Single document slot ─────────────────────────────────────

function DocSlot({
  type,
  label,
  doc,
  uploading,
  onFile,
  onDelete,
  onOpen,
}: {
  type: LeadDocType;
  label: string;
  doc: LeadDocument | null;
  uploading: boolean;
  onFile: (type: LeadDocType, file: File) => void;
  onDelete: (doc: LeadDocument) => void;
  onOpen: (doc: LeadDocument) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(type, f);
  }

  if (doc) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-green-200 bg-green-50/40 text-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-green-600 text-base leading-none">✓</span>
          <div className="min-w-0">
            <div className="font-semibold text-gray-800">{label}</div>
            <div className="text-gray-500 text-[10px] truncate">
              {doc.file_name} · {formatSize(doc.file_size)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => onOpen(doc)}
            className="px-2 py-1 rounded text-cyan-700 hover:bg-cyan-100 transition-colors"
            title="פתח"
          >
            פתח
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-2 py-1 rounded text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {uploading ? "..." : "החלף"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(doc)}
            className="px-1.5 py-1 rounded text-red-600 hover:bg-red-100 transition-colors"
            title="מחק"
          >
            ×
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf,.doc,.docx"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(type, f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  // Empty slot: drag-drop zone
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      disabled={uploading}
      className={`w-full text-right px-3 py-2 rounded-lg border-2 border-dashed transition-all text-xs ${
        over
          ? "border-cyan-500 bg-cyan-50 text-cyan-900"
          : "border-gray-200 bg-gray-50/40 text-gray-600 hover:border-cyan-400 hover:bg-cyan-50/30"
      } ${uploading ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-white border border-current/20 flex items-center justify-center text-base leading-none">
          {uploading ? "⏳" : "+"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{label}</div>
          <div className="text-[10px] opacity-70">
            {uploading ? "מעלה..." : "גרור קובץ או לחץ"}
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf,.doc,.docx"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(type, f);
          e.target.value = "";
        }}
      />
    </button>
  );
}

// ── Main section ─────────────────────────────────────────────

export function LeadDocumentsSection({ leadId }: { leadId: string }) {
  const [docs, setDocs] = useState<LeadDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState<Set<LeadDocType>>(new Set());

  // Initial fetch — does NOT block the UI from rendering the slots.
  useEffect(() => {
    let cancelled = false;
    getLeadDocuments(leadId).then((result) => {
      if (cancelled) return;
      setDocs(result);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [leadId]);

  async function uploadFile(type: LeadDocType, file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("הקובץ גדול מ-10MB");
      return;
    }
    setUploading((s) => new Set(s).add(type));
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("docType", type);
    fd.set("file", file);
    const res = await uploadLeadDocument(fd);
    setUploading((s) => {
      const next = new Set(s);
      next.delete(type);
      return next;
    });
    if (!res.success || !res.document) {
      toast.error(res.error ?? "העלאה נכשלה");
      return;
    }
    toast.success("הועלה");
    // Local-merge: remove any existing of same fixed type, prepend new doc.
    setDocs((prev) => {
      const filtered =
        type === "other"
          ? prev
          : prev.filter((d) => d.doc_type !== type);
      return [res.document!, ...filtered];
    });
  }

  async function handleDelete(doc: LeadDocument) {
    if (!confirm("למחוק את המסמך?")) return;
    const res = await deleteLeadDocument(doc.id);
    if (!res.success) {
      toast.error(res.error ?? "מחיקה נכשלה");
      return;
    }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    toast.success("נמחק");
  }

  async function handleOpen(doc: LeadDocument) {
    if (doc.signed_url) {
      window.open(doc.signed_url, "_blank", "noopener");
      return;
    }
    const res = await signLeadDocument(doc.id);
    if (!res.url) {
      toast.error(res.error ?? "לא ניתן לפתוח");
      return;
    }
    // Cache the URL on the doc for the rest of the session
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, signed_url: res.url } : d)));
    window.open(res.url, "_blank", "noopener");
  }

  const docsByType = new Map<LeadDocType, LeadDocument>();
  const otherDocs: LeadDocument[] = [];
  for (const d of docs) {
    if (d.doc_type === "other") otherDocs.push(d);
    else docsByType.set(d.doc_type, d);
  }

  return (
    <div className="border-t border-gray-200 mt-4 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          מסמכים
        </h4>
        {!loaded && <span className="text-[10px] text-gray-400">טוען...</span>}
      </div>

      <div className="space-y-1.5">
        {KNOWN_TYPES.map((type) => (
          <DocSlot
            key={type}
            type={type}
            label={LEAD_DOC_TYPES[type]}
            doc={docsByType.get(type) ?? null}
            uploading={uploading.has(type)}
            onFile={uploadFile}
            onDelete={handleDelete}
            onOpen={handleOpen}
          />
        ))}

        {/* "Other" — supports multiple */}
        <DocSlot
          type="other"
          label="מסמכים נוספים"
          doc={null}
          uploading={uploading.has("other")}
          onFile={uploadFile}
          onDelete={handleDelete}
          onOpen={handleOpen}
        />

        {otherDocs.length > 0 && (
          <div className="pl-3 mt-1 space-y-1">
            {otherDocs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1 rounded border border-gray-200 bg-white text-[11px]"
              >
                <button
                  type="button"
                  onClick={() => handleOpen(d)}
                  className="truncate hover:text-cyan-700 flex-1 text-right"
                >
                  📄 {d.file_name} · {formatSize(d.file_size)}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(d)}
                  className="text-red-600 hover:bg-red-100 px-1.5 rounded"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
