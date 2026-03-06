import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppMessage } from "@/lib/whatsappService";

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

    console.log(`[WhatsApp Bulk] Sending to ${r.phone}`);

    const sendResult = await sendWhatsAppMessage(r.phone, personalizedMessage);
    results.push({
      phone: r.phone,
      success: sendResult.success,
      error: sendResult.error,
    });
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`[WhatsApp Bulk] Total: ${sent} sent, ${failed} failed`);

  return NextResponse.json({ success: true, sent, failed, results });
}
