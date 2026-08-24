// המרה של כל מה שאפשר "לגרור" או "להדביק" לתוך קובץ אמיתי.
//
// גרירה מסייר הקבצים או מוואטסאפ דסקטופ מוסרת File אמיתי ועובדת ישירות.
// גרירה מתוך דף אינטרנט (וואטסאפ ווב, ג'ימייל, דרייב) מוסרת רק כתובת:
//   • data:  — מפוענח כאן, בלי רשת
//   • http(s) — נמשך דרך /api/fetch-remote-file (הדפדפן חוסם CORS)
//   • blob:  — שייך למקור אחר ולכן חסום לחלוטין; אין דרך לקרוא אותו,
//              והמשתמש מקבל הנחיה להעתיק ולהדביק במקום.

export class DropError extends Error {}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

function nameFor(contentType: string, hint?: string | null): string {
  if (hint) {
    const clean = hint.split("?")[0].split("/").pop();
    if (clean && /\.[a-z0-9]{2,5}$/i.test(clean)) return decodeURIComponent(clean);
  }
  const ext = EXT_BY_TYPE[contentType] ?? "bin";
  return `הודבק-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function blobToFile(blob: Blob, hint?: string | null): File {
  const type = blob.type || "application/octet-stream";
  return new File([blob], nameFor(type, hint), { type });
}

/** מוציא כתובת תמונה מתוך ה-DataTransfer של גרירה מדף אינטרנט. */
function urlFromDataTransfer(dt: DataTransfer): string | null {
  const uriList = dt.getData("text/uri-list")?.trim();
  if (uriList) {
    const first = uriList.split(/\r?\n/).find((l) => l && !l.startsWith("#"));
    if (first) return first.trim();
  }
  const html = dt.getData("text/html");
  const src = html?.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  if (src) return src;
  const text = dt.getData("text/plain")?.trim();
  if (text && /^(https?:|data:|blob:)/i.test(text)) return text;
  return null;
}

async function fileFromUrl(url: string): Promise<File> {
  if (url.startsWith("data:")) {
    const blob = await (await fetch(url)).blob();
    return blobToFile(blob);
  }

  if (url.startsWith("blob:")) {
    // blob: של מקור אחר — הדפדפן לא ייתן לנו לקרוא אותו בשום דרך
    throw new DropError(
      "אי אפשר לגרור ישירות מוואטסאפ ווב. לחץ קליק ימני על התמונה → העתק תמונה, ואז הדבק כאן עם Ctrl+V"
    );
  }

  const res = await fetch("/api/fetch-remote-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new DropError(data.error ?? "לא ניתן למשוך את הקובץ מהכתובת");
  }
  return blobToFile(await res.blob(), url);
}

/** כל הקבצים שאפשר להוציא מאירוע גרירה, לפי סדר העדיפות. */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const direct = Array.from(dt.files ?? []);
  if (direct.length > 0) return direct;

  const url = urlFromDataTransfer(dt);
  if (!url) {
    throw new DropError("לא נמצא קובץ בגרירה");
  }
  return [await fileFromUrl(url)];
}

/** כל הקבצים שאפשר להוציא מהדבקה (Ctrl+V). */
export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const direct = Array.from(data.files ?? []);
  if (direct.length > 0) return direct;
  return Array.from(data.items ?? [])
    .filter((i) => i.kind === "file")
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f);
}

/** קריאה יזומה של הלוח — מפעילה בקשת הרשאה בדפדפן בלחיצת המשתמש. */
export async function filesFromClipboardApi(): Promise<File[]> {
  if (!navigator.clipboard?.read) {
    throw new DropError("הדפדפן לא תומך בהדבקה מכפתור — השתמש ב-Ctrl+V");
  }
  let items: ClipboardItem[];
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new DropError("אין הרשאה לקרוא מהלוח — אשר את הבקשה או השתמש ב-Ctrl+V");
  }
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/") || t === "application/pdf");
    if (!type) continue;
    files.push(blobToFile(await item.getType(type)));
  }
  if (files.length === 0) {
    throw new DropError("אין תמונה או קובץ בלוח");
  }
  return files;
}
