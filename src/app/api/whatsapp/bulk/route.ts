import { NextRequest, NextResponse } from "next/server";

const GREEN_API_INSTANCE = process.env.GREEN_API_INSTANCE_ID!;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN!;
const GREEN_API_URL = `https://api.green-api.com/waInstance${GREEN_API_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`;

function formatChatId(phone: string): string {
  // Strip everything except digits
  let digits = phone.replace(/\D/g, "");
  // Convert local Israeli format (05x) to international (9725x)
  if (digits.startsWith("0")) {
    digits = "972" + digits.slice(1);
  }
  return digits + "@c.us";
}

// Test endpoint — GET /api/whatsapp/bulk?phone=972547000992 sends a hardcoded Hebrew message
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone") || "972547000992";
  const chatId = phone.includes("@") ? phone : phone + "@c.us";
  const payload = { chatId, message: "\u05E9\u05DC\u05D5\u05DD Barak, \u05D1\u05D3\u05D9\u05E7\u05EA \u05E2\u05D1\u05E8\u05D9\u05EA \u05DE\u05D4\u05E9\u05E8\u05EA!" };

  console.log("[WhatsApp Test] Payload:", JSON.stringify(payload));

  const res = await fetch(GREEN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const responseBody = await res.text();
  console.log("[WhatsApp Test] Status:", res.status, "Body:", responseBody);

  return NextResponse.json({ status: res.status, response: responseBody, payload });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { recipients, message } = body as {
    recipients: { name: string; phone: string }[];
    message: string;
  };

  if (!recipients?.length || !message) {
    return NextResponse.json(
      { error: "recipients and message are required" },
      { status: 400 }
    );
  }

  const results: { phone: string; success: boolean; error?: string }[] = [];

  for (const r of recipients) {
    const personalizedMessage = message.replace(/\{name\}/g, r.name);
    const chatId = formatChatId(r.phone);

    const payload = { chatId, message: personalizedMessage };
    const bodyBytes = new TextEncoder().encode(JSON.stringify(payload));

    console.log(`[WhatsApp Bulk] Phone: ${r.phone} -> chatId: ${chatId}`);
    console.log(`[WhatsApp Bulk] Payload:`, JSON.stringify(payload));
    console.log(`[WhatsApp Bulk] Body byte length: ${bodyBytes.length}`);

    try {
      const res = await fetch(GREEN_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(bodyBytes.length),
        },
        body: bodyBytes,
      });

      const responseBody = await res.text();
      console.log(`[WhatsApp Bulk] Green-API response status: ${res.status}`);
      console.log(`[WhatsApp Bulk] Green-API response body: ${responseBody}`);

      if (res.ok) {
        results.push({ phone: r.phone, success: true });
      } else {
        results.push({ phone: r.phone, success: false, error: responseBody });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`[WhatsApp Bulk] Fetch error for ${r.phone}: ${errMsg}`);
      results.push({ phone: r.phone, success: false, error: errMsg });
    }
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`[WhatsApp Bulk] Total: ${sent} sent, ${failed} failed`);

  return NextResponse.json({ success: true, sent, failed, results });
}
