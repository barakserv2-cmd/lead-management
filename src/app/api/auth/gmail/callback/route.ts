import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { createOAuth2Client } from "@/lib/gmail";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/settings?gmail_error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/settings?gmail_error=${encodeURIComponent("No authorization code received")}`
    );
  }

  try {
    const oauth2Client = createOAuth2Client();

    // Exchange auth code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user email
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    // Store tokens in settings table
    const now = new Date().toISOString();
    await getSupabase()
      .from("settings")
      .update({
        gmail_access_token: tokens.access_token,
        gmail_refresh_token: tokens.refresh_token,
        gmail_token_expiry: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        gmail_email: email,
        gmail_connected_at: now,
        updated_at: now,
      })
      .eq("id", 1);

    return NextResponse.redirect(`${baseUrl}/settings?gmail_connected=true`);
  } catch (err) {
    console.error("[Gmail OAuth] Callback error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      `${baseUrl}/settings?gmail_error=${encodeURIComponent(message)}`
    );
  }
}
