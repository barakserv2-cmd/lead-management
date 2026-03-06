"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { bulkImportLeads, type BulkImportRow } from "./actions";

// ── Block-style Excel Parser ─────────────────────────────────
// Handles multi-table sheets where employer names appear as
// standalone rows above each table's header row.

type ParsedField = "name" | "first_name" | "last_name" | "phone" | "job_title" | "hired_client" | "email" | "location";

const COLUMN_MAP: Record<string, ParsedField> = {
  "שם": "first_name",        // upgraded to "name" if no "שם משפחה" column exists
  "שם מלא": "name",
  "שם פרטי": "first_name",
  name: "name",
  "שם משפחה": "last_name",
  "טלפון": "phone",
  "מספר טלפון": "phone",
  "נייד": "phone",
  phone: "phone",
  tel: "phone",
  "תפקיד": "job_title",
  role: "job_title",
  "משרה": "job_title",
  job_title: "job_title",
  "מעסיק": "hired_client",
  "חברה": "hired_client",
  employer: "hired_client",
  company: "hired_client",
  "אימייל": "email",
  email: "email",
  "מייל": "email",
  "מיקום": "location",
  "עיר": "location",
  location: "location",
  city: "location",
};

const HEADER_KEYWORDS = new Set(Object.keys(COLUMN_MAP));

const GENERIC_SHEET_NAMES = new Set([
  "sheet1", "sheet2", "sheet3", "sheet4", "sheet5",
  "גיליון1", "גיליון2", "גיליון3", "גיליון4", "גיליון5",
]);

interface ColMapping {
  colIndex: number;
  field: ParsedField;
}

/** Try to detect a header row — must have at least a "name" type column. */
function detectHeaderRow(cells: unknown[]): ColMapping[] | null {
  if (!cells) return null;
  const mappings: ColMapping[] = [];
  let hasName = false;

  for (let i = 0; i < cells.length; i++) {
    const raw = String(cells[i] ?? "").trim().toLowerCase();
    if (!raw) continue;
    const field = COLUMN_MAP[raw];
    if (field) {
      mappings.push({ colIndex: i, field });
      if (field === "name" || field === "first_name") hasName = true;
    }
  }

  if (!hasName || mappings.length < 2) return null;

  // If "שם" mapped as first_name but no last_name column → treat as full name
  const hasLastName = mappings.some((m) => m.field === "last_name");
  if (!hasLastName) {
    for (const m of mappings) {
      if (m.field === "first_name") m.field = "name";
    }
  }

  return mappings;
}

function isEmptyRow(cells: unknown[]): boolean {
  if (!cells) return true;
  return cells.every((c) => !String(c ?? "").trim());
}

/**
 * Detect an employer/title row: 1–2 non-empty cells in the first 8 columns,
 * doesn't look like a phone number or a known header keyword.
 */
function detectEmployerRow(cells: unknown[]): string | null {
  if (!cells) return null;

  const values: string[] = [];
  let nonEmpty = 0;
  for (let i = 0; i < Math.min(cells.length, 8); i++) {
    const val = String(cells[i] ?? "").trim();
    if (val) {
      nonEmpty++;
      values.push(val);
    }
  }

  if (nonEmpty < 1 || nonEmpty > 2) return null;

  const text = values[0];
  if (!text || text.length < 2) return null;
  if (/^\d+$/.test(text)) return null;                     // pure number
  if (text.replace(/\D/g, "").length >= 7) return null;    // looks like phone
  if (HEADER_KEYWORDS.has(text.toLowerCase())) return null; // header keyword

  return text;
}

function parseWorkbook(wb: XLSX.WorkBook): BulkImportRow[] {
  const rows: BulkImportRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    if (data.length < 2) continue;

    // Use sheet name as initial employer unless it's a generic name
    let currentEmployer: string | null = GENERIC_SHEET_NAMES.has(sheetName.toLowerCase().trim())
      ? null
      : sheetName.trim();

    let mapping: ColMapping[] | null = null;

    for (let r = 0; r < data.length; r++) {
      const cells = data[r] as unknown[];

      // ── Empty row → reset header mapping (new block coming)
      if (isEmptyRow(cells)) {
        mapping = null;
        continue;
      }

      // ── Try to detect a header row
      const headerCandidate = detectHeaderRow(cells);
      if (headerCandidate) {
        mapping = headerCandidate;
        continue;
      }

      // ── No active mapping → check for employer title row
      if (!mapping) {
        const employer = detectEmployerRow(cells);
        if (employer) {
          currentEmployer = employer;
        }
        continue;
      }

      // ── Active mapping → extract data row
      let firstName = "";
      let lastName = "";
      const row: BulkImportRow = { name: "" };

      for (const { colIndex, field } of mapping) {
        const val = String(cells[colIndex] ?? "").trim();
        if (!val) continue;

        switch (field) {
          case "first_name":
            firstName = val;
            break;
          case "last_name":
            lastName = val;
            break;
          case "name":
            row.name = val;
            break;
          case "phone":
            row.phone = val;
            break;
          case "job_title":
            row.job_title = val;
            break;
          case "hired_client":
            row.hired_client = val;
            break;
          case "email":
            row.email = val;
            break;
          case "location":
            row.location = val;
            break;
        }
      }

      // Combine first + last name if needed
      if (!row.name && firstName) {
        row.name = lastName ? `${firstName} ${lastName}` : firstName;
      }

      // Apply block-level employer if row doesn't have its own
      if (!row.hired_client && currentEmployer) {
        row.hired_client = currentEmployer;
      }

      if (row.name) rows.push(row);
    }
  }

  return rows;
}

// ── Icons ────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────

interface BulkImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Override the source tag for imported leads (default: "ייבוא Excel") */
  source?: string;
}

type Stage = "upload" | "preview" | "importing" | "done";

export function BulkImportDialog({ open, onClose, source }: BulkImportDialogProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    normalized: number;
    errors: string[];
  } | null>(null);

  if (!open) return null;

  function reset() {
    setStage("upload");
    setFileName("");
    setRows([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const parsed = parseWorkbook(wb);

    if (parsed.length === 0) {
      setRows([]);
      setStage("preview");
      return;
    }

    setRows(parsed);
    setStage("preview");
  }

  async function handleImport() {
    setStage("importing");

    const res = await bulkImportLeads(rows, source ? { source } : undefined);

    setResult({
      imported: res.imported,
      skipped: res.skipped,
      normalized: res.normalized,
      errors: res.errors,
    });
    setStage("done");
    router.refresh();
  }

  const previewRows = rows.slice(0, 8);
  const hasEmployer = rows.some((r) => r.hired_client);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

      {/* Modal */}
      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-2xl mx-4 overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <FileIcon />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">ייבוא מ-Excel</h3>
              <p className="text-sm text-gray-500">
                {stage === "upload" && "העלה קובץ Excel או CSV עם נתוני מועמדים"}
                {stage === "preview" && `${rows.length} שורות נמצאו ב-${fileName}`}
                {stage === "importing" && "מייבא מועמדים..."}
                {stage === "done" && "הייבוא הושלם"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">

          {/* ─── UPLOAD STAGE ─── */}
          {stage === "upload" && (
            <div>
              <label
                htmlFor="bulk-file"
                className="flex flex-col items-center justify-center gap-3 py-12 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors"
              >
                <UploadIcon />
                <span className="text-sm font-medium text-gray-600">
                  לחץ לבחירת קובץ (.xlsx / .csv)
                </span>
                <span className="text-xs text-gray-400">
                  כותרות נדרשות: שם, טלפון, מעסיק, תפקיד
                </span>
              </label>
              <input
                ref={fileRef}
                id="bulk-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          )}

          {/* ─── PREVIEW STAGE ─── */}
          {stage === "preview" && rows.length === 0 && (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm mb-3">
                לא נמצאו שורות תקינות. וודא שהקובץ מכיל כותרת &quot;שם&quot; לפחות.
              </p>
              <button
                type="button"
                onClick={reset}
                className="text-sm text-cyan-600 hover:underline"
              >
                נסה קובץ אחר
              </button>
            </div>
          )}

          {stage === "preview" && rows.length > 0 && (
            <div>
              <div className="overflow-x-auto rounded-lg border border-gray-200 mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">#</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">שם</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">טלפון</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">תפקיד</th>
                      {hasEmployer && (
                        <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">מעסיק</th>
                      )}
                      <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">מיקום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-800 text-xs">{row.name}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs" dir="ltr">{row.phone ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{row.job_title ?? "—"}</td>
                        {hasEmployer && (
                          <td className="px-3 py-2 text-gray-600 text-xs">{row.hired_client ?? "—"}</td>
                        )}
                        <td className="px-3 py-2 text-gray-600 text-xs">{row.location ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && (
                <p className="text-xs text-gray-400 mb-4">
                  מציג 8 מתוך {rows.length} שורות
                </p>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
                <p className="text-sm text-amber-800">
                  <span className="font-semibold">{rows.length}</span> מועמדים ייובאו עם סטטוס
                  <span className="font-semibold"> &quot;מתאים לראיון&quot;</span>.
                  {hasEmployer && (
                    <> שמות מעסיקים ינורמלו אוטומטית מול מעסיקים קיימים במערכת.</>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* ─── IMPORTING STAGE ─── */}
          {stage === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-600">מייבא {rows.length} מועמדים...</p>
              <p className="text-xs text-gray-400">שמות מעסיקים מנורמלים אוטומטית</p>
            </div>
          )}

          {/* ─── DONE STAGE ─── */}
          {stage === "done" && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <CheckCircleIcon />
                <span className="text-sm font-semibold">
                  {result.imported} מועמדים יובאו בהצלחה!
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{result.imported}</p>
                  <p className="text-xs text-gray-500 mt-1">יובאו</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-cyan-600">{result.normalized}</p>
                  <p className="text-xs text-gray-500 mt-1">מעסיקים נורמלו</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-gray-400">{result.skipped}</p>
                  <p className="text-xs text-gray-500 mt-1">דולגו</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-red-700 mb-1">שגיאות:</p>
                  <ul className="text-xs text-red-600 space-y-0.5 max-h-24 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/60">
          {stage === "preview" && rows.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleImport}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
              >
                ייבא {rows.length} מועמדים
              </button>
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
              >
                בחר קובץ אחר
              </button>
            </>
          )}
          {stage === "done" && (
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
            >
              סגור
            </button>
          )}
          {(stage === "upload" || (stage === "preview" && rows.length === 0)) && (
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
            >
              ביטול
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
