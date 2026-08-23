import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import {
  configureInstanceWebhook,
  getInstancePhone,
  getInstanceQr,
  getInstanceState,
  logoutInstance,
  type WhatsAppAccount,
} from "@/lib/whatsappService";

// ============================================================
// /api/whatsapp/account — the signed-in recruiter's personal WhatsApp
//   GET            → status (+ QR while waiting for the phone to link)
//   POST           → link a Green API instance (instanceId + token)
//   DELETE         → unlink (optionally log the phone out of the instance)
// Tokens never leave the server — the client only gets state/phone/label.
// ============================================================

function admin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function currentEmail(): Promise<string | null> {
  const cookieClient = await createCookieClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  return user?.email?.toLowerCase() ?? null;
}

function webhookUrl(req: NextRequest): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : req.nextUrl.origin);
  return `${base}/api/whatsapp`;
}

interface Row {
  instance_id: string;
  api_token: string;
  phone: string | null;
  label: string | null;
  is_active: boolean;
  last_state: string | null;
  created_at: string;
}

async function loadRow(email: string): Promise<Row | null> {
  const { data } = await admin()
    .from("whatsapp_accounts")
    .select("instance_id, api_token, phone, label, is_active, last_state, created_at")
    .eq("user_email", email)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

function publicView(row: Row, state: string, qr: string | null = null) {
  return {
    connected: true,
    instanceId: row.instance_id,
    phone: row.phone,
    label: row.label,
    state,
    qr,
    createdAt: row.created_at,
  };
}

export async function GET(req: NextRequest) {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await loadRow(email);
  if (!row) return NextResponse.json({ connected: false });

  const account: WhatsAppAccount = { instanceId: row.instance_id, token: row.api_token };
  let state = "unknown";
  let qr: string | null = null;
  let phone = row.phone;
  try {
    state = await getInstanceState(account);
    if (state === "notAuthorized" && req.nextUrl.searchParams.get("qr") === "1") {
      qr = (await getInstanceQr(account)).qr;
    }
    if (state === "authorized" && !phone) {
      phone = await getInstancePhone(account);
    }
  } catch (err) {
    state = "error";
    console.error("[WhatsApp Account] state check failed:", err);
  }

  await admin()
    .from("whatsapp_accounts")
    .update({
      last_state: state,
      last_checked_at: new Date().toISOString(),
      ...(phone && phone !== row.phone ? { phone } : {}),
    })
    .eq("user_email", email);

  return NextResponse.json(publicView({ ...row, phone }, state, qr));
}

export async function POST(req: NextRequest) {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    instanceId?: string;
    token?: string;
    label?: string;
  };
  const instanceId = body.instanceId?.trim().replace(/\D/g, "") ?? "";
  const token = body.token?.trim() ?? "";
  if (!instanceId || !token) {
    return NextResponse.json(
      { error: "צריך גם Instance ID וגם API Token מ-Green API" },
      { status: 400 }
    );
  }

  const account: WhatsAppAccount = { instanceId, token };

  // Validate credentials against Green API before saving anything.
  let state: string;
  try {
    state = await getInstanceState(account);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Green API דחה את הפרטים — בדוק Instance ID ו-Token",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }

  // Route this instance's traffic to the CRM.
  try {
    await configureInstanceWebhook(account, webhookUrl(req));
  } catch (err) {
    console.error("[WhatsApp Account] webhook setup failed:", err);
  }

  const phone = state === "authorized" ? await getInstancePhone(account) : null;

  const { error } = await admin().from("whatsapp_accounts").upsert(
    {
      user_email: email,
      instance_id: instanceId,
      api_token: token,
      label: body.label?.trim() || null,
      phone,
      is_active: true,
      last_state: state,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_email" }
  );
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "ה-instance הזה כבר מחובר למשתמש אחר" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = await loadRow(email);
  return NextResponse.json(publicView(row!, state));
}

export async function DELETE(req: NextRequest) {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await loadRow(email);
  if (row && req.nextUrl.searchParams.get("logout") === "1") {
    await logoutInstance({ instanceId: row.instance_id, token: row.api_token });
  }
  await admin().from("whatsapp_accounts").delete().eq("user_email", email);
  return NextResponse.json({ connected: false });
}
