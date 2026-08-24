import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createClient } from "@/lib/supabase/server";

// גרירה של תמונה מדף אינטרנט (וואטסאפ ווב, ג'ימייל, דרייב…) לא מוסרת קובץ
// אלא כתובת בלבד, והדפדפן חוסם משיכה שלה מהצד שלנו (CORS). הנתיב הזה מושך
// אותה בצד השרת ומחזיר את הבייטים.
//
// נתיב שמושך URL שרירותי הוא וקטור SSRF קלאסי, ולכן הוא חסום היטב: רק
// משתמש מחובר, רק http/https, כתובות פנימיות נחסמות אחרי resolve של ה-DNS
// (כולל בכל הפנייה מחדש), סוגי תוכן מותרים בלבד, תקרת גודל וטיימאאוט.

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

const ALLOWED_TYPE = /^(image\/|application\/pdf$|application\/msword$|application\/vnd\.openxmlformats-officedocument\.)/;

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;              // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;    // CGNAT
  if (a >= 224) return true;                            // multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
  // ::ffff:10.0.0.1 וכדומה — כתובת IPv4 עטופה
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const literal = isIP(hostname);
  const addresses = literal
    ? [{ address: hostname, family: literal }]
    : await lookup(hostname, { all: true });

  if (addresses.length === 0) throw new Error("לא ניתן לאתר את הכתובת");

  for (const { address, family } of addresses) {
    const priv = family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
    if (priv) throw new Error("כתובת פנימית חסומה");
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(String(body.url ?? ""));
  } catch {
    return NextResponse.json({ error: "כתובת לא תקינה" }, { status: 400 });
  }

  let response: Response;
  try {
    let hops = 0;
    for (;;) {
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        return NextResponse.json({ error: "רק כתובות http/https נתמכות" }, { status: 400 });
      }
      await assertPublicHost(target.hostname);

      const res = await fetch(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "image/*,application/pdf,*/*;q=0.5" },
      });

      // הפנייה מחדש נבדקת מחדש — אחרת אפשר לקפוץ מכתובת ציבורית לפנימית
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (++hops > MAX_REDIRECTS) {
          return NextResponse.json({ error: "יותר מדי הפניות" }, { status: 400 });
        }
        target = new URL(res.headers.get("location")!, target);
        continue;
      }

      response = res;
      break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "שליפה נכשלה";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: `המקור החזיר ${response.status}` }, { status: 400 });
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!ALLOWED_TYPE.test(contentType)) {
    return NextResponse.json(
      { error: `סוג קובץ לא נתמך${contentType ? `: ${contentType}` : ""}` },
      { status: 400 }
    );
  }

  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מ-10MB" }, { status: 400 });
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מ-10MB" }, { status: 400 });
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(buffer.byteLength),
      "cache-control": "no-store",
    },
  });
}
