// ============================================================
// pdfSign — הטבעת חתימה דיגיטלית על מסמך.
//
// חותמת החתימה (שם + תאריך + ציור החתימה) מגיעה מהדפדפן כ-PNG
// מוכן — הדפדפן מרנדר עברית/RTL מושלם, בעוד pdf-lib לא יודע
// bidi shaping. השרת רק מוסיף עמוד חתימה ושורת audit בלטינית.
// ============================================================

import { PDFDocument, PDFImage, StandardFonts, rgb } from "pdf-lib";
import type { FieldPlacement } from "@/lib/signatureTypes";

const A4: [number, number] = [595.28, 841.89];

interface BuildOpts {
  /** קובץ המקור (PDF או תמונה) */
  source: Uint8Array;
  mime: string;
  /** חותמת החתימה כ-PNG (רקע שקוף, נוצר בדפדפן) */
  stampPng: Uint8Array;
  /** עמוד "פרטי המועמד" כ-PNG (נוצר בדפדפן) — אופציונלי */
  detailsPng?: Uint8Array;
  /**
   * הטבעה בתוך העמודים: משבצות ממופות + PNG לכל מפתח (הערך
   * מרונדר בדפדפן). כשקיים — הערכים נכנסים על הקווים בטופס
   * במקום עמודי נספח; עמוד חתימה מצורף רק אם 'signature' לא מופה.
   */
  overlays?: {
    placements: FieldPlacement[];
    images: Record<string, Uint8Array>;
  };
  /** שורת audit בלטינית בלבד — Helvetica לא יודע עברית */
  auditLine: string;
}

async function embedSourceImage(doc: PDFDocument, source: Uint8Array, mime: string): Promise<PDFImage> {
  if (mime === "image/png") return doc.embedPng(source);
  return doc.embedJpg(source);
}

/**
 * מחזיר PDF: עמודי המקור (או התמונה כעמוד) + עמוד חתימה מצורף.
 * זורק שגיאה על PDF פגום/מוצפן — למעלה מתרגמים להודעה למשתמש.
 */
export async function buildSignedPdf(opts: BuildOpts): Promise<Uint8Array> {
  let doc: PDFDocument;

  if (opts.mime === "application/pdf") {
    doc = await PDFDocument.load(opts.source, { ignoreEncryption: true });
  } else {
    doc = await PDFDocument.create();
    const img = await embedSourceImage(doc, opts.source, opts.mime);
    const page = doc.addPage(A4);
    // מתאימים את התמונה לעמוד עם שוליים, שומרים על יחס
    const margin = 40;
    const maxW = A4[0] - margin * 2;
    const maxH = A4[1] - margin * 2;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, {
      x: (A4[0] - w) / 2,
      y: A4[1] - margin - h,
      width: w,
      height: h,
    });
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);

  function drawAudit(page: ReturnType<PDFDocument["addPage"]>, y: number, size: number) {
    const auditWidth = font.widthOfTextAtSize(opts.auditLine, size);
    page.drawText(opts.auditLine, {
      x: (page.getWidth() - auditWidth) / 2,
      y,
      size,
      font,
      color: rgb(0.45, 0.5, 0.55),
    });
  }

  // ── הטבעה בתוך העמודים (מיפוי משבצות) ──────────────────────
  const placements = opts.overlays?.placements ?? [];
  if (placements.length > 0) {
    const embedded = new Map<string, PDFImage>();
    for (const p of placements) {
      const bytes = opts.overlays!.images[p.key];
      if (!bytes) continue;
      let img = embedded.get(p.key);
      if (!img) {
        img = await doc.embedPng(bytes);
        embedded.set(p.key, img);
      }
      const pageIdx = Math.min(p.page - 1, doc.getPageCount() - 1);
      const page = doc.getPage(pageIdx);
      const W = page.getWidth();
      const H = page.getHeight();
      const boxW = p.w * W;
      const boxH = p.h * H;
      const s = Math.min(boxW / img.width, boxH / img.height);
      const w = img.width * s;
      const h = img.height * s;
      page.drawImage(img, {
        // טפסים בעברית — הערך צמוד לימין המשבצת, ממורכז אנכית
        x: p.x * W + boxW - w,
        y: H - p.y * H - boxH + (boxH - h) / 2,
        width: w,
        height: h,
      });
    }

    // audit בתחתית העמוד האחרון של המקור
    drawAudit(doc.getPage(doc.getPageCount() - 1), 14, 7);

    // אם החתימה מופתה לתוך הטופס — אין צורך בעמודי נספח
    if (placements.some((p) => p.key === "signature")) {
      return doc.save();
    }
  }

  // ── עמוד פרטי המועמד (אם נאספו פרטים) ──────────────────────
  if (placements.length === 0 && opts.detailsPng) {
    const details = await doc.embedPng(opts.detailsPng);
    const page = doc.addPage(A4);
    const margin = 50;
    const maxW = A4[0] - margin * 2;
    const maxH = A4[1] - margin * 2;
    const s = Math.min(maxW / details.width, maxH / details.height);
    const w = details.width * s;
    const h = details.height * s;
    page.drawImage(details, {
      x: (A4[0] - w) / 2,
      y: A4[1] - margin - h,
      width: w,
      height: h,
    });
  }

  // ── עמוד חתימה ──────────────────────────────────────────────
  const stamp = await doc.embedPng(opts.stampPng);
  const page = doc.addPage(A4);

  const stampMaxW = 360;
  const scale = Math.min(stampMaxW / stamp.width, 1);
  const w = stamp.width * scale;
  const h = stamp.height * scale;
  const stampY = A4[1] - 120 - h;

  // מסגרת עדינה סביב החותמת
  page.drawRectangle({
    x: (A4[0] - w) / 2 - 16,
    y: stampY - 16,
    width: w + 32,
    height: h + 32,
    borderColor: rgb(0.8, 0.84, 0.88),
    borderWidth: 1,
  });
  page.drawImage(stamp, {
    x: (A4[0] - w) / 2,
    y: stampY,
    width: w,
    height: h,
  });

  drawAudit(page, 48, 8.5);

  return doc.save();
}
