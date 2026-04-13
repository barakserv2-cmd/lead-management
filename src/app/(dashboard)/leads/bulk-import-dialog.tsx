"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { bulkImportLeads, type BulkImportRow } from "./actions";

// ── Bulletproof Block-style Excel Parser ─────────────────────
// Uses DYNAMIC header detection with substring matching.
// Reads sheet in TEXT mode (raw: false).

type ParsedField = "name" | "first_name" | "last_name" | "phone" | "job_title" | "hired_client" | "email" | "location" | "arrival_date" | "ignore";

interface ColMapping {
  colIndex: number;
  field: ParsedField;
}

const GENERIC_SHEET_NAMES = new Set([
  "sheet1", "sheet2", "sheet3", "sheet4", "sheet5",
  "גיליון1", "גיליון2", "גיליון3", "גיליון4", "גיליון5",
]);

// ── Dynamic header classifier ───────────────────────────────
// Uses includes() matching with priority rules.
// Returns null for columns we want to skip entirely.

function classifyHeader(raw: string): ParsedField | null {
  const h = raw.trim().toLowerCase();
  if (!h) return null;

  // ── Arrival date: MUST contain "הגעה". Reject birth dates etc. ──
  if (h.includes("הגעה")) return "arrival_date";
  // Explicitly skip birth date, ID date, etc.
  if (h.includes("לידה") || h.includes("תעודה") || h.includes("זהות")) return "ignore";

  // ── Name fields ──
  if (h === "שם מלא" || h === "name" || h === "full name" || h === "שם ומשפחה") return "name";
  if (h === "שם משפחה" || h === "last name" || h === "משפחה") return "last_name";
  // "שם" or "שם פרטי" — first_name (promoted to name if no last_name column)
  if (h === "שם" || h === "שם פרטי" || h === "first name") return "first_name";

  // ── Phone — must not also match name/role keywords ──
  if (h.includes("טלפון") || h.includes("נייד") || h.includes("מספר טלפון")
    || h === "phone" || h === "tel" || h === "mobile") return "phone";

  // ── Role/job ──
  if (h.includes("תפקיד") || h.includes("משרה") || h === "role" || h === "job_title"
    || h === "job" || h === "position") return "job_title";

  // ── Employer ──
  if (h.includes("מעסיק") || h.includes("חברה") || h === "employer" || h === "company") return "hired_client";

  // ── Email ──
  if (h.includes("אימייל") || h.includes("מייל") || h === "email" || h === "mail") return "email";

  // ── Location ──
  if (h.includes("מיקום") || h.includes("עיר") || h === "location" || h === "city" || h === "address") return "location";

  return null;
}

// All known header keywords for detecting whether a row is a header
const HEADER_HINTS = [
  "שם", "טלפון", "נייד", "תפקיד", "משרה", "מעסיק", "חברה",
  "אימייל", "מייל", "מיקום", "עיר", "תאריך", "הגעה",
  "name", "phone", "tel", "role", "email", "location",
];

// ── Israeli date parser ─────────────────────────────────────

const DEFAULT_YEAR = "2026";

function parseArrivalDate(raw: unknown): string | null {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // REJECT if string contains ANY Hebrew or English letters (e.g. "ע.טבח")
  if (/[A-Za-z\u0590-\u05FF]/.test(str)) return null;

  // YYYY-MM-DD passthrough
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, , mm, dd] = iso;
    const m = Number(mm), d = Number(dd);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return str;
    return null;
  }

  // Range like "24/03-08/04" → take start date only
  let target = str;
  if (target.includes("-") && /[/.]/.test(target)) {
    target = target.split("-")[0].trim();
  }

  // Strict regex: only digits separated by / or .
  const match3 = target.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
  if (match3) {
    const d = Number(match3[1]), m = Number(match3[2]), y = Number(match3[3]);
    if (d < 1 || d > 31 || m < 1 || m > 12) return null;
    const fullYear = y < 100 ? 2000 + y : y;
    if (fullYear < 2020) return null; // reject birth dates etc.
    return `${fullYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const match2 = target.match(/^(\d{1,2})[\/.](\d{1,2})$/);
  if (match2) {
    const d = Number(match2[1]), m = Number(match2[2]);
    if (d < 1 || d > 31 || m < 1 || m > 12) return null;
    return `${DEFAULT_YEAR}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  return null;
}

// ── Phone cleaner ───────────────────────────────────────────

function cleanPhone(raw: string): string {
  // Strip everything except digits
  let digits = raw.replace(/[^\d]/g, "");
  // Convert 972 prefix to 0
  if (digits.startsWith("972")) digits = "0" + digits.slice(3);
  // Ensure leading 0
  if (digits.length >= 9 && !digits.startsWith("0")) digits = "0" + digits;
  return digits;
}

function looksLikePhone(val: string): boolean {
  const digits = val.replace(/[^\d]/g, "");
  return digits.length >= 9 && digits.length <= 12;
}

// ── Fuzzy phone extraction from cell text ──────────────────
// Handles glued text like "0533625131מלצר" → phone: "0533625131", remainder: "מלצר"

function extractPhoneFromCell(val: string): { phone: string; remainder: string } | null {
  if (!val) return null;

  // ── Strategy 1: Direct regex match on the raw string ──────
  // Matches 05X or 07X followed by optional dash then 7 digits (with optional dashes)
  const phoneRegex = /(0[57]\d[-]?\d{3,4}[-]?\d{3,4})/;
  const phoneMatch = val.match(phoneRegex);
  if (phoneMatch) {
    const matched = phoneMatch[0];
    const phone = matched.replace(/[-]/g, ""); // strip dashes → pure digits
    if (phone.length === 10) {
      // Strip the EXACT matched substring from the original to get the role
      const remainder = val.replace(matched, "").replace(/[-]/g, "").trim();
      return { phone, remainder };
    }
  }

  // ── Strategy 2: 972 international prefix ──────────────────
  const intlRegex = /(972[57]\d{7,8})/;
  const intlMatch = val.match(intlRegex);
  if (intlMatch) {
    const matched = intlMatch[0];
    const phone = "0" + matched.slice(3); // 972X... → 0X...
    if (phone.length === 10) {
      const remainder = val.replace(matched, "").replace(/[-]/g, "").trim();
      return { phone, remainder };
    }
  }

  return null;
}

let dummyPhoneCounter = 0;

/** Fuzzy extraction: scan ALL cells in a row for phone, date, email, name, role */
function extractDataFromRow(
  cells: string[],
  mapping: ColMapping[] | null,
  currentEmployer: string | null,
): BulkImportRow | null {
  // Clean all cells: trim + strip leading dashes
  const cleaned = cells.map(c => {
    let v = (c ?? "").trim();
    v = v.replace(/^-{2,}\s*/, "");
    return v;
  });

  let phone: string | null = null;
  let phoneRemainder: string | null = null;
  let name = "";
  let firstName = "";
  let lastName = "";
  let jobTitle: string | null = null;
  let email: string | null = null;
  let location: string | null = null;
  let arrivalDate: string | null = null;

  // ── PASS 1: Scan ALL cells for phone via regex ──
  for (let i = 0; i < cleaned.length; i++) {
    if (!cleaned[i]) continue;
    const result = extractPhoneFromCell(cleaned[i]);
    if (result && !phone) {
      phone = result.phone;
      if (result.remainder) phoneRemainder = result.remainder;
      cleaned[i] = result.remainder; // strip phone for subsequent passes
    }
  }

  // ── PASS 2: Scan ALL cells for arrival date ──
  for (let i = 0; i < cleaned.length; i++) {
    if (!cleaned[i]) continue;
    const parsed = parseArrivalDate(cleaned[i]);
    if (parsed) {
      arrivalDate = parsed;
      cleaned[i] = "";
      break;
    }
  }

  // ── PASS 3: Scan for email ──
  for (let i = 0; i < cleaned.length; i++) {
    if (!cleaned[i]) continue;
    if (cleaned[i].includes("@") && cleaned[i].includes(".")) {
      email = cleaned[i];
      cleaned[i] = "";
      break;
    }
  }

  // ── PASS 4: Use header mapping hints for name, job_title, location ──
  if (mapping) {
    for (const { colIndex, field } of mapping) {
      const val = cleaned[colIndex];
      if (!val) continue;
      switch (field) {
        case "name": if (!name) name = val; break;
        case "first_name": if (!firstName) firstName = val; break;
        case "last_name": if (!lastName) lastName = val; break;
        case "job_title": if (!jobTitle) jobTitle = val; break;
        case "location": if (!location) location = val; break;
        default: break;
      }
    }
  }

  // Combine first + last name
  if (!name && firstName) {
    name = lastName ? `${firstName} ${lastName}` : firstName;
  }

  // ── PASS 5: Fallback name — first Hebrew text cell not consumed ──
  if (!name) {
    for (const val of cleaned) {
      if (!val || val.length < 2) continue;
      if (/[\u0590-\u05FF]/.test(val) && !/^\d+$/.test(val)) {
        name = val;
        break;
      }
    }
  }

  // ── PASS 6: Phone remainder → job_title if we don't have one ──
  if (!jobTitle && phoneRemainder && /[\u0590-\u05FFA-Za-z]/.test(phoneRemainder)) {
    jobTitle = phoneRemainder;
  }

  if (!name) return null;

  // Determine candidate status based on phone extraction
  const hasRealPhone = !!phone;

  // Generate dummy phone for workers without extractable phone
  // This satisfies the unique constraint while marking them as non-candidates
  if (!phone) {
    dummyPhoneCounter++;
    phone = `no-phone-${Date.now()}-${dummyPhoneCounter}`;
  }

  return {
    name,
    phone,
    job_title: jobTitle || undefined,
    hired_client: currentEmployer || undefined,
    email: email || undefined,
    location: location || undefined,
    arrival_date: arrivalDate || undefined,
    is_candidate: hasRealPhone,
  };
}

// ── Row classifiers ─────────────────────────────────────────

function isEmptyRow(cells: string[]): boolean {
  if (!cells) return true;
  return cells.every((c) => !(c ?? "").trim());
}

function detectHeaderRow(cells: string[]): ColMapping[] | null {
  if (!cells) return null;

  // Count how many cells look like known headers
  let headerHits = 0;
  for (let i = 0; i < cells.length; i++) {
    const val = (cells[i] ?? "").trim().toLowerCase();
    if (!val) continue;
    if (HEADER_HINTS.some(hint => val.includes(hint))) headerHits++;
  }

  // Need at least 2 header-like cells to consider this a header row
  if (headerHits < 2) return null;

  // Now classify each cell
  const mappings: ColMapping[] = [];
  let hasName = false;

  for (let i = 0; i < cells.length; i++) {
    const val = (cells[i] ?? "").trim();
    if (!val) continue;
    const field = classifyHeader(val);
    if (field && field !== "ignore") {
      mappings.push({ colIndex: i, field });
      if (field === "name" || field === "first_name") hasName = true;
    }
  }

  if (!hasName || mappings.length < 2) return null;

  // Promote first_name → name if no last_name column exists
  const hasLastName = mappings.some((m) => m.field === "last_name");
  if (!hasLastName) {
    for (const m of mappings) {
      if (m.field === "first_name") m.field = "name";
    }
  }

  return mappings;
}

function detectEmployerRow(cells: string[]): string | null {
  if (!cells) return null;

  const values: string[] = [];
  let nonEmpty = 0;
  for (let i = 0; i < Math.min(cells.length, 8); i++) {
    const val = (cells[i] ?? "").trim();
    if (val) {
      nonEmpty++;
      values.push(val);
    }
  }

  if (nonEmpty < 1 || nonEmpty > 2) return null;

  const text = values[0];
  if (!text || text.length < 2) return null;
  if (/^\d+$/.test(text)) return null;
  if (looksLikePhone(text)) return null;
  // Skip if it looks like a header keyword
  const lower = text.toLowerCase();
  if (HEADER_HINTS.some(hint => lower.includes(hint))) return null;

  return text;
}

// ── State-machine block parser ──────────────────────────────

function parseWorkbook(wb: XLSX.WorkBook): BulkImportRow[] {
  const rows: BulkImportRow[] = [];
  dummyPhoneCounter = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    if (data.length < 2) continue;

    console.log(`[parser] Sheet "${sheetName}": ${data.length} rows`);
    console.log(`[parser] First 5 rows:`, data.slice(0, 5));

    let currentEmployer: string | null = GENERIC_SHEET_NAMES.has(sheetName.toLowerCase().trim())
      ? null
      : sheetName.trim();

    let mapping: ColMapping[] | null = null;

    for (let r = 0; r < data.length; r++) {
      const cells = data[r];

      if (isEmptyRow(cells)) {
        mapping = null;
        continue;
      }

      // ── Try to detect a header row
      const headerCandidate = detectHeaderRow(cells);
      if (headerCandidate) {
        mapping = headerCandidate;
        console.log(`[parser] Row ${r}: HEADER →`, headerCandidate.map(m => `[${m.colIndex}]${m.field}`).join(", "));
        continue;
      }

      // ── No active mapping → check for employer title row
      if (!mapping) {
        const employer = detectEmployerRow(cells);
        if (employer) {
          currentEmployer = employer;
          console.log(`[parser] Row ${r}: EMPLOYER = "${employer}"`);
        }
        continue;
      }

      // ── Active mapping → fuzzy extract from ALL cells ──────
      const extracted = extractDataFromRow(cells, mapping, currentEmployer);
      if (extracted) {
        rows.push(extracted);
      }
    }
  }

  console.log(`[parser] Total parsed: ${rows.length} rows`);
  if (rows.length > 0) {
    console.log(`[parser] Sample:`, {
      name: rows[0].name,
      phone: rows[0].phone,
      hired_client: rows[0].hired_client,
      arrival_date: rows[0].arrival_date,
    });
    console.log(`[parser] With arrival_date: ${rows.filter(r => r.arrival_date).length}`);
    console.log(`[parser] With hired_client: ${rows.filter(r => r.hired_client).length}`);
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
    updated: number;
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
      updated: res.updated,
      skipped: res.skipped,
      normalized: res.normalized,
      errors: res.errors,
    });
    setStage("done");
    router.refresh();
  }

  const previewRows = rows.slice(0, 8);
  const hasEmployer = rows.some((r) => r.hired_client);
  const hasArrivalDate = rows.some((r) => r.arrival_date);

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
                      {hasArrivalDate && (
                        <th className="px-3 py-2 text-right font-medium text-gray-600 text-xs">תאריך הגעה</th>
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
                        {hasArrivalDate && (
                          <td className="px-3 py-2 text-gray-600 text-xs" dir="ltr">{row.arrival_date ?? "—"}</td>
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
                  {result.imported} חדשים יובאו{result.updated > 0 ? `, ${result.updated} עודכנו` : ""} בהצלחה!
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{result.imported}</p>
                  <p className="text-xs text-gray-500 mt-1">חדשים</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                  <p className="text-xs text-gray-500 mt-1">עודכנו</p>
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
