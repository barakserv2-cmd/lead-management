// ============================================================
// "דוח ראיונות" — styled XLSX matching the office template:
// yellow merged title, peach "קבועים" block, plain "אקסטרות" block,
// Arial, thin borders, centered, RTL sheet.
// Pure builder — no DB access, so it can be unit-tested.
// ============================================================

import ExcelJS from "exceljs";

export interface InterviewReportRow {
  name: string;
  phone: string | null;
  interview_date: string; // ISO
  role: string | null;
  isExtra: boolean;
  notes: string | null; // קבועים: הערות
  commitment_date: string | null; // אקסטרות: YYYY-MM-DD
  arrived: "הגיע" | "לא הגיע" | "";
  accepted: "התקבל" | "לא התקבל" | "";
  accepted_to: string | null;
}

const YELLOW = "FFFFD965";
const PEACH = "FFFBE4D5";
const FONT = "Arial";

const thin: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const medium: Partial<ExcelJS.Borders> = {
  top: { style: "medium" },
  left: { style: "medium" },
  bottom: { style: "medium" },
  right: { style: "medium" },
};
const center: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
  readingOrder: "rtl",
  wrapText: true,
};

/** "2026-08-05" → "05.08.26" */
export function fmtReportDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

// interview_date נשמר כשעון קיר ישראלי עם תווית UTC — קוראים את שדות ה-UTC ישירות.
function ilTimeOfDay(iso: string): Date | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Excel time-of-day: a Date on the 1899-12-30 epoch day
  return new Date(Date.UTC(1899, 11, 30, d.getUTCHours(), d.getUTCMinutes()));
}

function isoDateOnly(s: string | null): Date | string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export async function buildInterviewsWorkbook(date: string, rows: InterviewReportRow[]): Promise<Buffer> {
  const byTime = (a: InterviewReportRow, b: InterviewReportRow) =>
    a.interview_date.localeCompare(b.interview_date) || a.name.localeCompare(b.name, "he");

  const blocks: { title: string; typeHeader: string; fill: string | null; col7: string; rows: InterviewReportRow[] }[] = [
    {
      title: `דוח הגעות ${fmtReportDate(date)}`,
      typeHeader: "קבוע",
      fill: PEACH,
      col7: "הערות",
      rows: rows.filter((r) => !r.isExtra).sort(byTime),
    },
    {
      title: `אקסטרות  ${fmtReportDate(date)}`,
      typeHeader: "אקסטרה",
      fill: null,
      col7: "תאריך התחייבות",
      rows: rows.filter((r) => r.isExtra).sort(byTime),
    },
  ];

  const wb = new ExcelJS.Workbook();
  wb.creator = "ברק שירותים";
  const ws = wb.addWorksheet("דוח ראיונות", { views: [{ rightToLeft: true }] });
  ws.columns = [7, 22, 15, 11, 11, 20, 18, 15, 17, 16].map((width) => ({ width }));

  let r = 1;
  blocks.forEach((block, bi) => {
    ws.mergeCells(r, 1, r, 10);
    const title = ws.getCell(r, 1);
    title.value = block.title;
    title.font = { name: FONT, size: 20, bold: true };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
    title.alignment = center;
    for (let c = 1; c <= 10; c++) ws.getCell(r, c).border = bi === 0 ? thin : medium;
    ws.getRow(r).height = 26.25;
    r++;

    const headers = [
      'מס"ד',
      "שם העובד",
      "טלפון",
      "שעת הגעה",
      block.typeHeader,
      "תפקיד",
      block.col7,
      "הגיע/לא הגיע",
      "התקבל/לא התקבל",
      "לאן התקבל",
    ];
    headers.forEach((h, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = h;
      cell.font = { name: FONT, size: 12, bold: true };
      if (block.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: block.fill } };
      cell.alignment = center;
      cell.border = thin;
    });
    ws.getRow(r).height = 15.75;
    r++;

    block.rows.forEach((row, idx) => {
      const values: (string | number | Date | null)[] = [
        idx + 1,
        row.name,
        row.phone ?? "",
        ilTimeOfDay(row.interview_date),
        block.typeHeader,
        row.role ?? "",
        bi === 0 ? (row.notes ?? "") : isoDateOnly(row.commitment_date),
        row.arrived,
        row.accepted,
        row.accepted_to ?? "",
      ];
      values.forEach((v, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = v;
        const bold = i === 0 || i === 4;
        cell.font = { name: FONT, size: bi === 0 || bold ? 12 : 11, bold };
        if (block.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: block.fill } };
        cell.alignment = center;
        cell.border = thin;
        if (i === 3) cell.numFmt = "h:mm";
        if (i === 6 && bi === 1) cell.numFmt = "d-mmm";
      });
      ws.getRow(r).height = 15.75;
      r++;
    });
  });

  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
