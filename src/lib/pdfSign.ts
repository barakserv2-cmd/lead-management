// ============================================================
// pdfSign — הטבעת חתימה דיגיטלית על מסמך.
//
// חותמת החתימה (שם + תאריך + ציור החתימה) מגיעה מהדפדפן כ-PNG
// מוכן — הדפדפן מרנדר עברית/RTL מושלם, בעוד pdf-lib לא יודע
// bidi shaping. השרת רק מוסיף עמוד חתימה ושורת audit בלטינית.
// ============================================================

import { PDFDocument, PDFImage, StandardFonts, rgb } from "pdf-lib";

const A4: [number, number] = [595.28, 841.89];

interface BuildOpts {
  /** קובץ המקור (PDF או תמונה) */
  source: Uint8Array;
  mime: string;
  /** חותמת החתימה כ-PNG (רקע שקוף, נוצר בדפדפן) */
  stampPng: Uint8Array;
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

  // ── עמוד חתימה ──────────────────────────────────────────────
  const stamp = await doc.embedPng(opts.stampPng);
  const font = await doc.embedFont(StandardFonts.Helvetica);
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

  const audit = opts.auditLine;
  const auditSize = 8.5;
  const auditWidth = font.widthOfTextAtSize(audit, auditSize);
  page.drawText(audit, {
    x: (A4[0] - auditWidth) / 2,
    y: 48,
    size: auditSize,
    font,
    color: rgb(0.45, 0.5, 0.55),
  });

  return doc.save();
}
