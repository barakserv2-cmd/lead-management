import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppMessage, resolveSender } from "@/lib/whatsappService";
import { getMessageScope } from "@/lib/messageVisibility";
import { createClient as createCookieClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const cookieClient = await createCookieClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Bulk goes out from the recruiter's own number when linked.
  const scope = await getMessageScope(user.email);
  if (!scope.canSend) {
    return NextResponse.json(
      { error: "אין לך מספר וואטסאפ מחובר — שליחה מרוכזת דורשת מספר מחובר." },
      { status: 403 }
    );
  }
  const sender = await resolveSender(user.email);

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

    const sendResult = await sendWhatsAppMessage(r.phone, personalizedMessage, sender);
    results.push({
      phone: r.phone,
      success: sendResult.success,
      error: sendResult.error,
    });
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`[WhatsApp Bulk] Total: ${sent} sent, ${failed} failed`);

  return NextResponse.json({
    success: true,
    sent,
    failed,
    results,
    sentFrom: sender.label ?? sender.phone ?? null,
  });
}
