"use server";

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getGmailStatus(): Promise<{
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}> {
  try {
    const { data, error } = await getSupabase()
      .from("settings")
      .select("gmail_email, gmail_connected_at, gmail_refresh_token")
      .eq("id", 1)
      .single();

    if (error || !data || !data.gmail_refresh_token) {
      return { connected: false, email: null, connectedAt: null };
    }

    return {
      connected: true,
      email: data.gmail_email,
      connectedAt: data.gmail_connected_at,
    };
  } catch {
    return { connected: false, email: null, connectedAt: null };
  }
}

export async function disconnectGmail(): Promise<{ error: string | null }> {
  const { error } = await getSupabase()
    .from("settings")
    .update({
      gmail_access_token: null,
      gmail_refresh_token: null,
      gmail_token_expiry: null,
      gmail_email: null,
      gmail_connected_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return { error: error?.message ?? null };
}
