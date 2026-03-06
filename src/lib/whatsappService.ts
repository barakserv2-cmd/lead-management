// ============================================================
// WhatsApp Service — Shared Green API send utility
// ============================================================

const GREEN_API_INSTANCE = process.env.GREEN_API_INSTANCE_ID!;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN!;

/**
 * Convert a phone string to Green API chatId format.
 * Strips non-digits, converts Israeli 05x → 9725x, appends @c.us.
 */
export function formatChatId(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = "972" + digits.slice(1);
  }
  return digits + "@c.us";
}

/**
 * Extract a local Israeli phone number from a Green API chatId.
 * "972501234567@c.us" → "0501234567"
 */
export function phoneFromChatId(chatId: string): string {
  const digits = chatId.replace(/@c\.us$/, "");
  if (digits.startsWith("972")) {
    return "0" + digits.slice(3);
  }
  return digits;
}

export interface SendResult {
  success: boolean;
  idMessage?: string;
  error?: string;
}

/**
 * Send a WhatsApp message via Green API.
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<SendResult> {
  const url = `https://api.green-api.com/waInstance${GREEN_API_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`;
  const chatId = formatChatId(phone);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });

    const body = await res.json();

    if (res.ok) {
      return { success: true, idMessage: body.idMessage };
    }
    return { success: false, error: JSON.stringify(body) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
