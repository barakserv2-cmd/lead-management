import { NextRequest, NextResponse } from "next/server";

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

  // Log each personalized message (stub — replace with real WhatsApp API later)
  for (const r of recipients) {
    const personalizedMessage = message.replace(/\{name\}/g, r.name);
    console.log(
      `[WhatsApp Bulk] To: ${r.phone} | Message: ${personalizedMessage}`
    );
  }

  console.log(
    `[WhatsApp Bulk] Total: ${recipients.length} messages queued`
  );

  return NextResponse.json({
    success: true,
    sent: recipients.length,
  });
}
