"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  uploadLeadDocument,
  getLeadDocuments,
  deleteLeadDocument,
  signLeadDocument,
} from "@/lib/actions/leadDocuments";
import { LEAD_DOC_TYPES, type LeadDocument, type LeadDocType } from "@/lib/leadDocTypes";
import { DropError, filesFromClipboard, filesFromClipboardApi, filesFromDrop } from "@/lib/dropToFile";
import { isSignableMime, type SignatureRequest } from "@/lib/signatureTypes";

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

// ── חתימה דיגיטלית: סטטוס + פעולות על מסמך ──────────────────

interface SignState {
  /** בקשה pending שממתינה על המסמך הזה */
  pending: SignatureRequest | null;
  /** המסמך הזה הוא עותק חתום */
  signed: boolean;
}

function SignControls({
  doc,
  sign,
  onSend,
  onCancel,
  onCopyLink,
  sending,
}: {
  doc: LeadDocument;
  sign: SignState;
  onSend: (doc: LeadDocument) => void;
  onCancel: (req: SignatureRequest) => void;
  onCopyLink: (req: SignatureRequest) => void;
  sending: boolean;
}) {
  if (sign.signed) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold whitespace-nowrap">
        ✍️ נחתם דיגיטלית
      </span>
    );
  }
  if (sign.pending) {
    const req = sign.pending;
    return (
      <span className="flex items-center gap-1 whitespace-nowrap">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
          ⏳ ממתין לחתימה
        </span>
        <button
          type="button"
          onClick={() => onCopyLink(req)}
          className="text-[10px] px-1 py-0.5 rounded text-cyan-700 hover:bg-cyan-100"
          title="העתק קישור חתימה"
        >
          🔗
        </button>
        <button
          type="button"
          onClick={() => onCancel(req)}
          className="text-[10px] px-1 py-0.5 rounded text-red-600 hover:bg-red-100"
          title="בטל בקשת חתימה"
        >
          בטל
        </button>
      </span>
    );
  }
  if (!isSignableMime(doc.mime_type)) return null;
  return (
    <button
      type="button"
      onClick={() => onSend(doc)}
      disabled={sending}
      className="text-[10px] px-1.5 py-0.5 rounded text-violet-700 hover:bg-violet-100 transition-colors whitespace-nowrap disabled:opacity-50"
      title="שליחת קישור חתימה דיגיטלית בוואטסאפ"
    >
      {sending ? "..." : "✍️ לחתימה"}
    </button>
  );
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
  sign,
  onSendSign,
  onCancelSign,
  onCopySignLink,
  signSending,
}: {
  type: LeadDocType;
  label: string;
  doc: LeadDocument | null;
  uploading: boolean;
  onFile: (type: LeadDocType, file: File) => void;
  onDelete: (doc: LeadDocument) => void;
  onOpen: (doc: LeadDocument) => void;
  sign?: SignState;
  onSendSign?: (doc: LeadDocument) => void;
  onCancelSign?: (req: SignatureRequest) => void;
  onCopySignLink?: (req: SignatureRequest) => void;
  signSending?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);

  // "מסמכים נוספים" הוא היחיד שמחזיק כמה קבצים — בשאר כל קובץ דורס את הקודם,
  // אז נגררים כמה בבת אחת נלקח הראשון בלבד.
  function accept(files: File[]) {
    const chosen = type === "other" ? files : files.slice(0, 1);
    for (const f of chosen) onFile(type, f);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    try {
      accept(await filesFromDrop(e.dataTransfer));
    } catch (err) {
      toast.error(err instanceof DropError ? err.message : "לא ניתן לקרוא את מה שנגרר");
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const files = filesFromClipboard(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();
    accept(files);
  }

  async function handlePasteButton(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      accept(await filesFromClipboardApi());
    } catch (err) {
      toast.error(err instanceof DropError ? err.message : "הדבקה נכשלה");
    }
  }

  if (doc) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
          over ? "border-cyan-500 bg-cyan-50" : "border-green-200 bg-green-50/40"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-green-600 text-base leading-none">✓</span>
          <div className="min-w-0">
            <div className="font-semibold text-gray-800 flex items-center gap-1.5">
              {label}
              {sign && onSendSign && onCancelSign && onCopySignLink && (
                <SignControls
                  doc={doc}
                  sign={sign}
                  onSend={onSendSign}
                  onCancel={onCancelSign}
                  onCopyLink={onCopySignLink}
                  sending={!!signSending}
                />
              )}
            </div>
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
      onPaste={handlePaste}
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
            {uploading ? "מעלה..." : "גרור קובץ, הדבק, או לחץ"}
          </div>
        </div>
        {!uploading && (
          <span
            onClick={handlePasteButton}
            title="הדבק תמונה או קובץ מהלוח"
            className="flex-shrink-0 text-[10px] px-1.5 py-1 rounded border border-current/20 bg-white/70 hover:bg-white text-gray-600"
          >
            📋 הדבק
          </span>
        )}
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

// ── ספריית תבניות לשליחה בקליק ──────────────────────────────

interface SignTemplate {
  id: string;
  name: string;
  doc_type: string;
  file_name: string;
}

// ── Main section ─────────────────────────────────────────────

export function LeadDocumentsSection({ leadId }: { leadId: string }) {
  const [docs, setDocs] = useState<LeadDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState<Set<LeadDocType>>(new Set());
  const [sigRequests, setSigRequests] = useState<SignatureRequest[]>([]);
  const [signSending, setSignSending] = useState<string | null>(null); // doc id
  const [templates, setTemplates] = useState<SignTemplate[]>([]);
  const [templateSending, setTemplateSending] = useState<string | null>(null); // template id

  // Initial fetch — does NOT block the UI from rendering the slots.
  useEffect(() => {
    let cancelled = false;
    getLeadDocuments(leadId).then((result) => {
      if (cancelled) return;
      setDocs(result);
      setLoaded(true);
    });
    fetch(`/api/sign/requests?leadId=${leadId}`)
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled && Array.isArray(body.requests)) setSigRequests(body.requests);
      })
      .catch(() => {});
    fetch("/api/sign/templates")
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled && Array.isArray(body.templates)) setTemplates(body.templates);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [leadId]);

  // ── חתימה דיגיטלית ─────────────────────────────────────────

  function signStateFor(doc: LeadDocument): SignState {
    return {
      pending: sigRequests.find(
        (r) => r.status === "pending" && r.document_id === doc.id &&
          new Date(r.expires_at).getTime() > Date.now()
      ) ?? null,
      signed: sigRequests.some(
        (r) => r.status === "signed" && r.signed_document_id === doc.id
      ),
    };
  }

  async function handleSendSign(doc: LeadDocument) {
    if (!confirm(`לשלוח למועמד קישור חתימה דיגיטלית בוואטסאפ על "${doc.file_name}"?`)) return;
    setSignSending(doc.id);
    try {
      const res = await fetch("/api/sign/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const body = await res.json();
      if (body.request) {
        setSigRequests((prev) => [
          body.request,
          ...prev.map((r) =>
            r.document_id === doc.id && r.status === "pending"
              ? { ...r, status: "cancelled" as const }
              : r
          ),
        ]);
      }
      if (body.success) {
        toast.success("קישור החתימה נשלח בוואטסאפ ✍️");
      } else if (body.link) {
        await navigator.clipboard.writeText(body.link).catch(() => {});
        toast.error(body.error ?? "השליחה נכשלה", { description: "הקישור הועתק ללוח — אפשר לשלוח ידנית" });
      } else {
        toast.error(body.error ?? "השליחה נכשלה");
      }
    } catch {
      toast.error("השליחה נכשלה");
    } finally {
      setSignSending(null);
    }
  }

  async function handleCancelSign(req: SignatureRequest) {
    if (!confirm("לבטל את בקשת החתימה? הקישור שנשלח יפסיק לעבוד.")) return;
    const res = await fetch("/api/sign/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: req.id }),
    }).then((r) => r.json()).catch(() => ({ success: false }));
    if (!res.success) {
      toast.error(res.error ?? "הביטול נכשל");
      return;
    }
    setSigRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, status: "cancelled" as const } : r))
    );
    toast.success("בקשת החתימה בוטלה");
  }

  async function handleSendTemplate(t: SignTemplate) {
    if (!confirm(`לשלוח למועמד את "${t.name}" לחתימה דיגיטלית בוואטסאפ?`)) return;
    setTemplateSending(t.id);
    try {
      const res = await fetch("/api/sign/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, templateId: t.id }),
      });
      const body = await res.json();
      if (body.document) {
        // המסמך החדש נכנס לסלוט — מחליף קודם מאותו סוג (חוץ מ'אחר')
        setDocs((prev) => {
          const filtered =
            body.document.doc_type === "other"
              ? prev
              : prev.filter((d) => d.doc_type !== body.document.doc_type);
          return [body.document, ...filtered];
        });
      }
      if (body.request) {
        setSigRequests((prev) => [body.request, ...prev]);
      }
      if (body.success) {
        toast.success(`"${t.name}" נשלח לחתימה בוואטסאפ ✍️`);
      } else if (body.link) {
        await navigator.clipboard.writeText(body.link).catch(() => {});
        toast.error(body.error ?? "השליחה נכשלה", { description: "הקישור הועתק ללוח — אפשר לשלוח ידנית" });
      } else {
        toast.error(body.error ?? "השליחה נכשלה");
      }
    } catch {
      toast.error("השליחה נכשלה");
    } finally {
      setTemplateSending(null);
    }
  }

  async function handleCopySignLink(req: SignatureRequest) {
    const link = `${window.location.origin}/sign/${req.token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("קישור החתימה הועתק");
    } catch {
      toast.error("ההעתקה נכשלה");
    }
  }



  const uploadFile = useCallback(async function uploadFile(type: LeadDocType, file: File) {
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
  }, [leadId]);

  // Ctrl+V בכל מקום בכרטיס — צילום מסך או תמונה שהועתקה מוואטסאפ ווב נכנס
  // ל"מסמכים נוספים". לא נוגעים בהדבקה לתוך שדות טקסט, ולא בהדבקת טקסט.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const files = filesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      for (const f of files) void uploadFile("other", f);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadFile]);

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

      <p className="text-[10px] text-gray-400 mb-2 leading-relaxed">
        גרירה מסייר הקבצים או מוואטסאפ דסקטופ · העתקה מוואטסאפ ווב והדבקה ב-Ctrl+V ·
        גרירת תמונה מדף אינטרנט
      </p>

      <div className="space-y-1.5">
        {KNOWN_TYPES.map((type) => {
          const doc = docsByType.get(type) ?? null;
          return (
            <DocSlot
              key={type}
              type={type}
              label={LEAD_DOC_TYPES[type]}
              doc={doc}
              uploading={uploading.has(type)}
              onFile={uploadFile}
              onDelete={handleDelete}
              onOpen={handleOpen}
              sign={doc ? signStateFor(doc) : undefined}
              onSendSign={handleSendSign}
              onCancelSign={handleCancelSign}
              onCopySignLink={handleCopySignLink}
              signSending={!!doc && signSending === doc.id}
            />
          );
        })}

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
                <SignControls
                  doc={d}
                  sign={signStateFor(d)}
                  onSend={handleSendSign}
                  onCancel={handleCancelSign}
                  onCopyLink={handleCopySignLink}
                  sending={signSending === d.id}
                />
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

        {/* ── שליחת מסמכים קבועים לחתימה דיגיטלית ── */}
        {templates.length > 0 && (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/40 p-2.5">
            <div className="text-[11px] font-semibold text-violet-800 mb-1.5 flex items-center gap-1">
              ✍️ שליחת מסמך לחתימה דיגיטלית
            </div>
            <div className="space-y-1">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-white border border-violet-100 text-[11px]"
                >
                  <span className="truncate text-gray-700">📄 {t.name}</span>
                  <button
                    type="button"
                    onClick={() => handleSendTemplate(t)}
                    disabled={templateSending !== null}
                    className="flex-shrink-0 px-2 py-0.5 rounded bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
                  >
                    {templateSending === t.id ? "שולח..." : "שלח ✍️"}
                  </button>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-violet-700/60 mt-1.5">
              המועמד מקבל קישור בוואטסאפ, חותם מהנייד, והמסמך החתום נשמר כאן
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
