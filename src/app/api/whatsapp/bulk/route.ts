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

    console.log(`[WhatsApp Bulk] Phone: ${r.phone} -> chatId: ${chatId}`);
    console.log(`[WhatsApp Bulk] Payload:`, JSON.stringify(payload));

    try {
      const res = await fetch(GREEN_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
