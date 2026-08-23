// ============================================================
// WhatsApp Service — Green API send utility + per-recruiter accounts
// ============================================================
//
// Two kinds of senders:
//   1. The business number (env GREEN_API_INSTANCE_ID / GREEN_API_TOKEN) —
//      used by the AI screening flow and as a fallback.
//   2. A recruiter's personal number — a Green API instance linked by the
//      recruiter under /settings/whatsapp (table whatsapp_accounts). Manual
//      and bulk sends from the CRM go out from the signed-in recruiter's
//      number when one is linked.

import { createClient as createServerClient } from "@supabase/supabase-js";

export interface WhatsAppAccount {
  instanceId: string;
  token: string;
  /** recruiter email; undefined for the business number */
  userEmail?: string;
  label?: string | null;
  phone?: string | null;
}

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** The shared business number from env. */
export function businessAccount(): WhatsAppAccount {
  // .trim(): the Vercel env value carries a trailing newline.
  return {
    instanceId: (process.env.GREEN_API_INSTANCE_ID ?? "").trim(),
    token: (process.env.GREEN_API_TOKEN ?? "").trim(),
    label: "מספר העסק",
  };
}

interface AccountRow {
  user_email: string;
  instance_id: string;
  api_token: string;
  phone: string | null;
  label: string | null;
  is_active: boolean;
}

function rowToAccount(r: AccountRow): WhatsAppAccount {
  return {
    instanceId: r.instance_id,
    token: r.api_token,
    userEmail: r.user_email,
    label: r.label,
    phone: r.phone,
  };
}

/** Active personal account linked by this recruiter, or null. */
export async function getAccountForEmail(
  email: string | null | undefined
): Promise<WhatsAppAccount | null> {
  if (!email) return null;
  const { data } = await adminClient()
    .from("whatsapp_accounts")
    .select("user_email, instance_id, api_token, phone, label, is_active")
    .eq("user_email", email.toLowerCase())
    .eq("is_active", true)
    .maybeSingle();
  return data ? rowToAccount(data as AccountRow) : null;
}

/** Account that owns a Green API instance (personal or business). */
export async function getAccountByInstance(
  instanceId: string | number | null | undefined
): Promise<WhatsAppAccount> {
  const id = instanceId == null ? "" : String(instanceId);
  const biz = businessAccount();
  if (!id || id === biz.instanceId) return biz;
  const { data } = await adminClient()
    .from("whatsapp_accounts")
    .select("user_email, instance_id, api_token, phone, label, is_active")
    .eq("instance_id", id)
    .maybeSingle();
  return data ? rowToAccount(data as AccountRow) : biz;
}

/** Sender for the signed-in recruiter: their own number, else the business one. */
export async function resolveSender(
  email: string | null | undefined
): Promise<WhatsAppAccount> {
  return (await getAccountForEmail(email)) ?? businessAccount();
}

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

function apiUrl(account: WhatsAppAccount, method: string): string {
  return `https://api.green-api.com/waInstance${account.instanceId}/${method}/${account.token}`;
}

/**
 * Send a WhatsApp message via Green API from the given account
 * (defaults to the business number).
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  account: WhatsAppAccount = businessAccount()
): Promise<SendResult> {
  const chatId = formatChatId(phone);

  try {
    const res = await fetch(apiUrl(account, "sendMessage"), {
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

// ------------------------------------------------------------
// Instance management (used by /settings/whatsapp)
// ------------------------------------------------------------

export type InstanceState =
  | "authorized"
  | "notAuthorized"
  | "blocked"
  | "sleepMode"
  | "starting"
  | "yellowCard"
  | "unknown";

/** Green API getStateInstance. Throws on bad credentials / network. */
export async function getInstanceState(
  account: WhatsAppAccount
): Promise<InstanceState> {
  const res = await fetch(apiUrl(account, "getStateInstance"), {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Green API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { stateInstance?: string };
  return (body.stateInstance as InstanceState) ?? "unknown";
}

/** Linked phone number of the instance ("972541234567") or null. */
export async function getInstancePhone(
  account: WhatsAppAccount
): Promise<string | null> {
  try {
    const res = await fetch(apiUrl(account, "getWaSettings"), { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { phone?: string };
    return body.phone ?? null;
  } catch {
    return null;
  }
}

/**
 * QR code for linking the phone (only meaningful while notAuthorized).
 * Returns a data: URL, or null if the instance is already authorized /
 * not ready yet.
 */
export async function getInstanceQr(
  account: WhatsAppAccount
): Promise<{ qr: string | null; message?: string }> {
  const res = await fetch(apiUrl(account, "qr"), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Green API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { type?: string; message?: string };
  if (body.type === "qrCode" && body.message) {
    return { qr: `data:image/png;base64,${body.message}` };
  }
  return { qr: null, message: body.message };
}

/**
 * Point the instance's webhook at our CRM so inbound messages (and
 * messages the recruiter sends from their phone) reach the lead's chat.
 */
export async function configureInstanceWebhook(
  account: WhatsAppAccount,
  webhookUrl: string
): Promise<void> {
  const res = await fetch(apiUrl(account, "setSettings"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl,
      incomingWebhook: "yes",
      outgoingWebhook: "yes",
      outgoingAPIMessageWebhook: "no",
      stateWebhook: "no",
      markIncomingMessagesReaded: "no",
    }),
  });
  if (!res.ok) {
    throw new Error(`Green API setSettings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

/** Log out the phone from the instance (so a different number can be linked). */
export async function logoutInstance(account: WhatsAppAccount): Promise<void> {
  await fetch(apiUrl(account, "logout"), { cache: "no-store" }).catch(() => {});
}
