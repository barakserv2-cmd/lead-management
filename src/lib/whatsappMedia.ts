import { getSupabaseAdmin } from "@/lib/api-auth";
import type { WhatsAppAccount } from "@/lib/whatsappService";

/**
 * קבצים שמועמדים שולחים בערוץ הרשמי — נשמרים במסמכים של הליד.
 *
 * 22.09: מועמדים שלחו לתמי תמונות וקורות חיים, ו-V1 רשם רק "[קובץ התקבל —
 * לא נשמר]". הקובץ עצמו נשאר בטלפון שלה בלבד.
 *
 * ההורדה בשני שלבים: קודם מבקשים את כתובת הקובץ לפי המזהה, ואז מורידים
 * אותה באותו אימות. ב-360dialog הכתובת שחוזרת היא של מטא (lookaside),
 * ומורידים אותה דרך השרת של 360 — אצל מטא עצמה ישירות עם Bearer.
 */

export interface InboundMedia {
  id: string;
  kind: "image" | "document" | "video" | "audio";
  mimeType?: string | null;
  filename?: string | null;
  caption?: string | null;
}

const BUCKET = "lead-documents";
/** הגבול של ה-bucket lead-documents (10MB) — קובץ גדול יותר נדחה שם בכל מקרה */
const MAX_BYTES = 10 * 1024 * 1024;

const KIND_LABEL: Record<InboundMedia["kind"], string> = {
  image: "תמונה",
  document: "מסמך",
  video: "סרטון",
  audio: "הודעה קולית",
};

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function mediaLabel(kind: InboundMedia["kind"]): string {
  return KIND_LABEL[kind];
}

/** הטקסט שנרשם בשיחה במקום הקובץ */
export function mediaMessageText(media: InboundMedia, saved: boolean): string {
  const label = KIND_LABEL[media.kind];
  const name = media.kind === "document" && media.filename ? ` (${media.filename})` : "";
  const head = saved
    ? `📎 ${label}${name} — נשמר/ה במסמכים של המועמד/ת`
    : `📎 ${label}${name} התקבל/ה — השמירה נכשלה, הקובץ בטלפון`;
  const caption = media.caption?.trim();
  return caption ? `${head}\n${caption}` : head;
}

async function downloadMedia(
  account: WhatsAppAccount,
  mediaId: string
): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  const token = (process.env[account.tokenEnv ?? ""] ?? "").trim();
  if (!token) return null;
  const d360 = account.authStyle === "d360";
  const root = (
    (account.apiBase ?? "").trim() ||
    (d360 ? "https://waba-v2.360dialog.io" : "https://graph.facebook.com/v21.0")
  ).replace(/\/+$/, "");
  const headers: Record<string, string> = d360
    ? { "D360-API-KEY": token }
    : { Authorization: `Bearer ${token}` };

  const metaRes = await fetch(`${root}/${encodeURIComponent(mediaId)}`, { headers });
  if (!metaRes.ok) {
    console.error(`[WhatsApp Media] lookup ${mediaId} failed: HTTP ${metaRes.status}`);
    return null;
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!meta.url) return null;
  if (meta.file_size && meta.file_size > MAX_BYTES) {
    console.warn(`[WhatsApp Media] ${mediaId} too large (${meta.file_size})`);
    return null;
  }

  let url = meta.url;
  if (d360) {
    const u = new URL(meta.url);
    url = `${root}${u.pathname}${u.search}`;
  }
  const fileRes = await fetch(url, { headers });
  if (!fileRes.ok) {
    console.error(`[WhatsApp Media] download ${mediaId} failed: HTTP ${fileRes.status}`);
    return null;
  }
  const bytes = await fileRes.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return null;
  return {
    bytes,
    mimeType: meta.mime_type || fileRes.headers.get("content-type") || "application/octet-stream",
  };
}

/**
 * מוריד את הקובץ ושומר אותו כמסמך "אחר" של הליד. לעולם לא זורק —
 * כשל כאן לא יכול להפיל את קליטת ההודעה.
 */
export async function saveInboundMedia(
  account: WhatsAppAccount,
  leadId: string,
  media: InboundMedia
): Promise<boolean> {
  try {
    const file = await downloadMedia(account, media.id);
    if (!file) return false;

    const mime = file.mimeType.split(";")[0].trim();
    const ext = EXT[mime] ?? mime.split("/")[1]?.replace(/[^\w]/g, "") ?? "bin";
    const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
    const fileName = media.filename?.trim() || `${KIND_LABEL[media.kind]} מוואטסאפ ${stamp}.${ext}`;
    const safeName = fileName.replace(/[^\w.\-]+/g, "_");
    const path = `${leadId}/other_${Date.now()}_${safeName}`;

    const admin = getSupabaseAdmin();
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file.bytes, {
      contentType: mime,
      upsert: false,
    });
    if (upErr) {
      console.error(`[WhatsApp Media] upload failed for lead ${leadId}:`, upErr.message);
      return false;
    }
    const { error: insErr } = await admin.from("lead_documents").insert({
      lead_id: leadId,
      doc_type: "other",
      file_path: path,
      file_name: fileName,
      mime_type: mime,
      file_size: file.bytes.byteLength,
      uploaded_by: null,
    });
    if (insErr) {
      await admin.storage.from(BUCKET).remove([path]);
      console.error(`[WhatsApp Media] document row failed for lead ${leadId}:`, insErr.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[WhatsApp Media] save failed:", (e as Error).message);
    return false;
  }
}
